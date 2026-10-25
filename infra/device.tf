locals {
  warp_include = [
    { host = var.api_hostname, description = "Alias API" },
    { host = data.cloudflare_zero_trust_organization.team.auth_domain, description = "Access team domain, needed for device posture" },
  ]
}

# The default profile and the enrollment application exist once per account, so other
# projects may rely on them; both are managed only on request.
resource "cloudflare_zero_trust_device_default_profile" "split_tunnel" {
  count = var.manage_device_profile ? 1 : 0

  account_id = var.account_id
  include    = local.warp_include
}

resource "cloudflare_zero_trust_access_policy" "enroll" {
  count = var.manage_device_enrollment ? 1 : 0

  account_id = var.account_id
  name       = "${local.worker_name}-enroll"
  decision   = "allow"
  include    = [for email in var.enroll_emails : { email = { email = email } }]

  lifecycle {
    precondition {
      condition     = length(var.enroll_emails) > 0
      error_message = "Set enroll_emails to the addresses allowed to enroll devices."
    }
  }
}

data "cloudflare_zero_trust_access_applications" "all" {
  count = var.manage_device_enrollment ? 1 : 0

  account_id = var.account_id
}

locals {
  # An account has at most one. Adopted rather than created when present; mock providers
  # cannot import, so this path is covered only against a real account.
  existing_enroll_app = one([
    for app in try(data.cloudflare_zero_trust_access_applications.all[0].result, []) : app if app.type == "warp"
  ])
}

import {
  for_each = toset([for app in local.existing_enroll_app == null ? [] : [local.existing_enroll_app] : tostring(app.id)])

  to = cloudflare_zero_trust_access_application.enroll[0]
  id = "accounts/${var.account_id}/${each.value}"
}

resource "cloudflare_zero_trust_access_application" "enroll" {
  count = var.manage_device_enrollment ? 1 : 0

  account_id = var.account_id
  type       = "warp"
  # Copied so that adopting the application changes only its policies.
  allowed_idps              = try(local.existing_enroll_app.allowed_idps, null)
  auto_redirect_to_identity = try(local.existing_enroll_app.auto_redirect_to_identity, null)
  policies                  = [{ id = cloudflare_zero_trust_access_policy.enroll[0].id, precedence = 1 }]
}
