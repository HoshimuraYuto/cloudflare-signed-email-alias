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

  mock_data "cloudflare_zero_trust_device_default_profile" {
    defaults = {
      include = null
      exclude = [{ address = "10.0.0.0/8", description = null, host = null }]
    }
  }

  mock_data "cloudflare_zero_trust_device_settings" {
    defaults = { gateway_proxy_enabled = false, gateway_udp_proxy_enabled = true, use_zt_virtual_ip = true }
  }

  mock_data "cloudflare_dns_records" {
    defaults = { result = [] }
  }

  mock_data "cloudflare_email_routing_catch_all" {
    defaults = { enabled = false, actions = [{ type = "drop", value = null }] }
  }
}

variables {
  state_passphrase = "passphrase-for-tests-only"
  account_id       = "account"
  forwarding       = { "example.com" = "inbox@example.net" }
}

run "routes_mail_and_api_to_the_worker" {
  command = plan

  assert {
    condition     = cloudflare_email_routing_catch_all.alias["example.com"].actions[0].type == "worker" && cloudflare_email_routing_catch_all.alias["example.com"].actions[0].value[0] == "cloudflare-signed-email-alias"
    error_message = "The catch-all must hand every alias to the Worker."
  }
  assert {
    condition     = cloudflare_workers_custom_domain.api["example.com"].hostname == "email-alias-api.example.com" && cloudflare_workers_custom_domain.api["example.com"].service == "cloudflare-signed-email-alias"
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
    condition     = toset([for entry in output.warp_include : entry.host]) == toset(["email-alias-api.example.com", "team.cloudflareaccess.com"])
    error_message = "The hosts to route through WARP must still be reported."
  }
}

run "manages_the_device_profile_on_request" {
  command = plan

  variables {
    manage_device_profile = true
  }

  assert {
    condition     = terraform_data.split_tunnel_original[0].input.exclude[0].address == "10.0.0.0/8"
    error_message = "The split tunnel from before this project must be kept for destroy."
  }

  assert {
    condition     = toset([for entry in cloudflare_zero_trust_device_default_profile.split_tunnel[0].include : entry.host]) == toset(["email-alias-api.example.com", "team.cloudflareaccess.com"])
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

# Adopting an existing application, with its policies, cannot be tested here: mock providers
# cannot run the import. These runs cover an account without one.
run "adds_its_policy_with_a_value_known_at_plan" {
  command = plan

  variables {
    manage_device_enrollment = true
    enroll_emails            = ["me@example.net"]
  }

  # The provider rejects a policy list that is unknown at plan.
  assert {
    condition     = [for policy in cloudflare_zero_trust_access_application.enroll[0].policies : policy.precedence] == [1]
    error_message = "This project's policy must be the only one, and known before apply."
  }
}

run "puts_the_recorded_policies_back_when_releasing_enrollment" {
  command = plan

  # No addresses: destroy does not need ENROLL_EMAILS.
  variables {
    manage_device_enrollment  = true
    release_device_enrollment = true
  }

  assert {
    condition     = length(cloudflare_zero_trust_access_application.enroll[0].policies) == 0
    error_message = "Releasing must leave exactly the policies the application had before."
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
    target = data.cloudflare_email_routing_catch_all.current["example.com"]
    values = { enabled = true, actions = [{ type = "worker", value = ["cloudflare-signed-email-alias"] }] }
  }
}

run "refuses_a_zone_whose_catch_all_is_in_use" {
  command = plan

  override_data {
    target = data.cloudflare_email_routing_catch_all.current["example.com"]
    values = { enabled = true, actions = [{ type = "forward", value = ["someone@example.net"] }] }
  }

  expect_failures = [cloudflare_email_routing_catch_all.alias["example.com"]]
}

run "gives_each_domain_its_own_hostname_and_inbox" {
  command = plan

  variables {
    forwarding = {
      "example.com" = "inbox@example.net"
      "example.org" = "other@example.net"
    }
  }

  assert {
    condition     = toset([for domain in cloudflare_workers_custom_domain.api : domain.hostname]) == toset(["email-alias-api.example.com", "email-alias-api.example.org"])
    error_message = "Every alias domain needs its own API hostname."
  }
  assert {
    condition     = toset(keys(cloudflare_email_routing_catch_all.alias)) == toset(["example.com", "example.org"]) && toset(keys(cloudflare_email_routing_dns.alias)) == toset(["example.com", "example.org"])
    error_message = "Every alias domain needs Email Routing and a catch-all to the Worker."
  }
  assert {
    condition     = toset([for address in cloudflare_email_routing_address.destination : address.email]) == toset(["inbox@example.net", "other@example.net"])
    error_message = "Every inbox must be registered as a destination."
  }
  assert {
    condition     = toset([for entry in output.warp_include : entry.host]) == toset(["email-alias-api.example.com", "email-alias-api.example.org", "team.cloudflareaccess.com"])
    error_message = "Devices must route every API hostname through WARP."
  }
}

run "registers_a_shared_inbox_once" {
  command = plan

  variables {
    forwarding = {
      "example.com" = "inbox@example.net"
      "example.org" = "inbox@example.net"
    }
  }

  assert {
    condition     = length(cloudflare_email_routing_address.destination) == 1
    error_message = "One inbox serving two domains is one destination address."
  }
}

run "uses_the_chosen_api_subdomain" {
  command = plan

  variables {
    api_subdomain = "aliases"
  }

  assert {
    condition     = cloudflare_workers_custom_domain.api["example.com"].hostname == "aliases.example.com"
    error_message = "The API hostname must use api_subdomain."
  }
}

run "rejects_an_api_subdomain_with_a_dot" {
  command = plan

  variables {
    api_subdomain = "a.b"
  }

  expect_failures = [var.api_subdomain]
}

run "rejects_no_alias_domain" {
  command = plan

  variables {
    forwarding = {}
  }

  expect_failures = [var.forwarding]
}

run "rejects_an_upper_case_inbox" {
  command = plan

  variables {
    forwarding = { "example.com" = "Inbox@example.net" }
  }

  expect_failures = [var.forwarding]
}

run "rejects_an_upper_case_domain" {
  command = plan

  variables {
    forwarding = { "Example.com" = "inbox@example.net" }
  }

  expect_failures = [var.forwarding]
}

run "leaves_dmarc_alone_by_default" {
  command = plan

  assert {
    condition     = length(cloudflare_dns_record.dmarc) == 0
    error_message = "DMARC is a domain-wide record; it is published only on request."
  }
}

run "publishes_dmarc_on_every_domain_on_request" {
  command = plan

  variables {
    dmarc_policy = "reject"
    forwarding = {
      "example.com" = "inbox@example.net"
      "example.org" = "other@example.net"
    }
  }

  assert {
    condition     = toset([for record in cloudflare_dns_record.dmarc : "${record.name} ${record.content}"]) == toset(["_dmarc.example.com v=DMARC1; p=reject", "_dmarc.example.org v=DMARC1; p=reject"])
    error_message = "Every alias domain needs the DMARC record with the chosen policy."
  }
  assert {
    condition     = alltrue([for record in cloudflare_dns_record.dmarc : record.comment == "cloudflare-signed-email-alias"])
    error_message = "The record must carry the marker later deploys recognise it by."
  }
}

run "keeps_its_own_dmarc_record_on_later_applies" {
  command = plan

  variables {
    dmarc_policy = "reject"
  }

  override_data {
    target = data.cloudflare_dns_records.dmarc["example.com"]
    values = {
      result = [
        {
          comment             = "cloudflare-signed-email-alias"
          comment_modified_on = null
          content             = "v=DMARC1; p=reject"
          created_on          = null
          data                = null
          id                  = "ours"
          meta                = null
          modified_on         = null
          name                = "_dmarc.example.com"
          priority            = null
          private_routing     = null
          proxiable           = null
          proxied             = null
          settings            = null
          tags                = null
          tags_modified_on    = null
          ttl                 = null
          type                = "TXT"
        },
      ]
    }
  }

  assert {
    condition     = length(cloudflare_dns_record.dmarc) == 1
    error_message = "Its own record must not block a later deploy."
  }
}

run "refuses_a_domain_with_its_own_dmarc_record" {
  command = plan

  variables {
    dmarc_policy = "reject"
  }

  override_data {
    target = data.cloudflare_dns_records.dmarc["example.com"]
    values = {
      result = [
        {
          comment             = ""
          comment_modified_on = null
          content             = "v=DMARC1; p=none"
          created_on          = null
          data                = null
          id                  = "theirs"
          meta                = null
          modified_on         = null
          name                = "_dmarc.example.com"
          priority            = null
          private_routing     = null
          proxiable           = null
          proxied             = null
          settings            = null
          tags                = null
          tags_modified_on    = null
          ttl                 = null
          type                = "TXT"
        },
      ]
    }
  }

  expect_failures = [cloudflare_dns_record.dmarc["example.com"]]
}

run "rejects_an_unknown_dmarc_policy" {
  command = plan

  variables {
    dmarc_policy = "strict"
  }

  expect_failures = [var.dmarc_policy]
}

run "leaves_the_gateway_proxy_alone_by_default" {
  command = plan

  assert {
    condition     = length(cloudflare_zero_trust_device_settings.gateway_proxy) == 0 && length(terraform_data.gateway_proxy_original) == 0
    error_message = "The account's device settings must not be touched unless asked."
  }
}

run "turns_on_the_gateway_proxy_on_request" {
  command = plan

  variables {
    manage_gateway_proxy = true
  }

  assert {
    condition     = cloudflare_zero_trust_device_settings.gateway_proxy[0].gateway_proxy_enabled == true
    error_message = "The posture check needs the Gateway proxy."
  }
  assert {
    condition     = cloudflare_zero_trust_device_settings.gateway_proxy[0].gateway_udp_proxy_enabled == true && cloudflare_zero_trust_device_settings.gateway_proxy[0].use_zt_virtual_ip == true
    error_message = "Every other device setting must stay as it was."
  }
  assert {
    condition     = terraform_data.gateway_proxy_original[0].input.gateway_proxy_enabled == false
    error_message = "The proxy setting from before this project must be kept for destroy."
  }
}
