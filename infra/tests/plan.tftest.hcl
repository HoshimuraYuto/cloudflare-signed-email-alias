mock_provider "cloudflare" {
  mock_data "cloudflare_workers" {
    defaults = {
      result = [{
        name                 = "cloudflare-signed-email-alias"
        id                   = "worker-immutable-id"
        created_on           = null
        deployed_on          = null
        logpush              = null
        observability        = null
        previews_base_config = null
        references           = null
        subdomain            = null
        tags                 = null
        tail_consumers       = null
        updated_on           = null
      }]
    }
  }

  mock_data "cloudflare_zero_trust_organization" {
    defaults = { auth_domain = "team.cloudflareaccess.com" }
  }

  mock_data "cloudflare_zero_trust_access_applications" {
    defaults = { result = [] }
  }

  mock_data "cloudflare_email_routing_catch_all" {
    defaults = { enabled = false, actions = [{ type = "drop", value = null }] }
  }
}

variables {
  state_passphrase   = "passphrase-for-tests-only"
  account_id         = "account"
  alias_domain       = "example.com"
  api_hostname       = "alias-api.example.com"
  forward_to         = "inbox@example.net"
}

run "routes_mail_and_api_to_the_worker" {
  command = plan

  assert {
    condition     = cloudflare_email_routing_catch_all.alias.actions[0].type == "worker" && cloudflare_email_routing_catch_all.alias.actions[0].value[0] == "cloudflare-signed-email-alias"
    error_message = "The catch-all must hand every alias to the Worker."
  }
  assert {
    condition     = cloudflare_workers_custom_domain.api.hostname == "alias-api.example.com" && cloudflare_workers_custom_domain.api.service == "cloudflare-signed-email-alias"
    error_message = "The API hostname must point at the Worker."
  }
  assert {
    condition     = cloudflare_zero_trust_access_application.api.destinations[0].worker_id == "worker-immutable-id"
    error_message = "Access must protect the Worker by its immutable ID."
  }
}

run "access_requires_the_service_token_on_an_enrolled_device" {
  command = plan

  assert {
    condition     = cloudflare_zero_trust_access_policy.api.decision == "non_identity"
    error_message = "Service tokens need a Service Auth policy."
  }
  assert {
    condition     = cloudflare_zero_trust_device_posture_rule.gateway.type == "gateway"
    error_message = "Only the Gateway check limits access to enrolled devices."
  }
  assert {
    condition     = cloudflare_zero_trust_access_application.api.read_service_tokens_from_header == "Authorization"
    error_message = "Password managers send the token in the Authorization header."
  }
}

run "leaves_the_device_profile_alone_by_default" {
  command = plan

  assert {
    condition     = length(cloudflare_zero_trust_device_default_profile.split_tunnel) == 0
    error_message = "The shared default profile must not be touched unless asked."
  }
  assert {
    condition     = toset([for entry in output.warp_include : entry.host]) == toset(["alias-api.example.com", "team.cloudflareaccess.com"])
    error_message = "The hosts to route through WARP must still be reported."
  }
}

run "manages_the_device_profile_on_request" {
  command = plan

  variables {
    manage_device_profile = true
  }

  assert {
    condition     = toset([for entry in cloudflare_zero_trust_device_default_profile.split_tunnel[0].include : entry.host]) == toset(["alias-api.example.com", "team.cloudflareaccess.com"])
    error_message = "The split tunnel must include the API and the team domain."
  }
}

run "creates_its_own_service_token" {
  command = plan

  assert {
    condition     = cloudflare_zero_trust_access_service_token.client.name == "cloudflare-signed-email-alias"
    error_message = "The service token belongs to this project, so deploy creates it."
  }
}

run "leaves_device_enrollment_alone_by_default" {
  command = plan

  assert {
    condition     = length(cloudflare_zero_trust_access_application.enroll) == 0 && length(cloudflare_zero_trust_access_policy.enroll) == 0
    error_message = "The account's single enrollment application must not be touched unless asked."
  }
}

run "manages_device_enrollment_on_request" {
  command = plan

  variables {
    manage_device_enrollment = true
    enroll_emails            = ["me@example.net"]
  }

  assert {
    condition     = cloudflare_zero_trust_access_application.enroll[0].type == "warp"
    error_message = "Device enrollment permissions are the account's warp application."
  }
  assert {
    condition     = cloudflare_zero_trust_access_policy.enroll[0].decision == "allow" && toset([for rule in cloudflare_zero_trust_access_policy.enroll[0].include : rule.email.email]) == toset(["me@example.net"])
    error_message = "Only the listed addresses may enroll devices."
  }
}

run "refuses_to_manage_enrollment_without_addresses" {
  command = plan

  variables {
    manage_device_enrollment = true
  }

  expect_failures = [cloudflare_zero_trust_access_policy.enroll]
}

run "keeps_its_own_catch_all_on_later_applies" {
  command = plan

  override_data {
    target = data.cloudflare_email_routing_catch_all.current
    values = { enabled = true, actions = [{ type = "worker", value = ["cloudflare-signed-email-alias"] }] }
  }
}

run "refuses_a_zone_whose_catch_all_is_in_use" {
  command = plan

  override_data {
    target = data.cloudflare_email_routing_catch_all.current
    values = { enabled = true, actions = [{ type = "forward", value = ["someone@example.net"] }] }
  }

  expect_failures = [cloudflare_email_routing_catch_all.alias]
}

run "rejects_an_api_hostname_outside_the_alias_zone" {
  command = plan

  variables {
    api_hostname = "alias-api.example.org"
  }

  expect_failures = [var.api_hostname]
}
