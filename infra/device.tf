locals {
  warp_include = concat(
    [for domain in keys(var.forwarding) : { host = "${var.api_subdomain}.${domain}", description = "Alias API" }],
    [{ host = data.cloudflare_zero_trust_organization.team.auth_domain, description = "Access team domain, needed for device posture" }],
  )
}

# The default profile, the device settings and the enrollment application exist once per
# account, so other projects may rely on them; all are managed only on request.
data "cloudflare_zero_trust_device_default_profile" "current" {
  count = var.manage_device_profile ? 1 : 0

  account_id = var.account_id
}

# Kept from the first apply on, so destroy can put back what was there before this project.
resource "terraform_data" "split_tunnel_original" {
  count = var.manage_device_profile ? 1 : 0

  input = {
    include = data.cloudflare_zero_trust_device_default_profile.current[0].include
    exclude = data.cloudflare_zero_trust_device_default_profile.current[0].exclude
  }

  lifecycle {
    ignore_changes = [input]
  }
}

resource "cloudflare_zero_trust_device_default_profile" "split_tunnel" {
  count = var.manage_device_profile ? 1 : 0

  account_id = var.account_id
  include    = local.warp_include

  depends_on = [terraform_data.split_tunnel_original]
}

data "cloudflare_zero_trust_device_settings" "current" {
  count = var.manage_gateway_proxy ? 1 : 0

  account_id = var.account_id
}

resource "terraform_data" "gateway_proxy_original" {
  count = var.manage_gateway_proxy ? 1 : 0

  input = {
    gateway_proxy_enabled     = data.cloudflare_zero_trust_device_settings.current[0].gateway_proxy_enabled
    gateway_udp_proxy_enabled = data.cloudflare_zero_trust_device_settings.current[0].gateway_udp_proxy_enabled
  }

  lifecycle {
    ignore_changes = [input]
  }
}

# The device posture check passes only for traffic the Gateway proxies.
resource "cloudflare_zero_trust_device_settings" "gateway_proxy" {
  count = var.manage_gateway_proxy ? 1 : 0

  account_id            = var.account_id
  gateway_proxy_enabled = true
  # The rest is copied, so that only the proxy changes.
  gateway_udp_proxy_enabled             = data.cloudflare_zero_trust_device_settings.current[0].gateway_udp_proxy_enabled
  disable_for_time                      = data.cloudflare_zero_trust_device_settings.current[0].disable_for_time
  external_emergency_signal_enabled     = data.cloudflare_zero_trust_device_settings.current[0].external_emergency_signal_enabled
  external_emergency_signal_fingerprint = data.cloudflare_zero_trust_device_settings.current[0].external_emergency_signal_fingerprint
  external_emergency_signal_interval    = data.cloudflare_zero_trust_device_settings.current[0].external_emergency_signal_interval
  external_emergency_signal_url         = data.cloudflare_zero_trust_device_settings.current[0].external_emergency_signal_url
  root_certificate_installation_enabled = data.cloudflare_zero_trust_device_settings.current[0].root_certificate_installation_enabled
  use_zt_virtual_ip                     = data.cloudflare_zero_trust_device_settings.current[0].use_zt_virtual_ip

  depends_on = [terraform_data.gateway_proxy_original]

  lifecycle {
    # The provider updates with PUT; fixed after creation so later applies send only the proxy.
    ignore_changes = [
      gateway_udp_proxy_enabled,
      disable_for_time,
      external_emergency_signal_enabled,
      external_emergency_signal_fingerprint,
      external_emergency_signal_interval,
      external_emergency_signal_url,
      root_certificate_installation_enabled,
      use_zt_virtual_ip,
    ]
  }
}

# No addresses closes enrollment: registered devices stay connected, new ones cannot enroll.
resource "cloudflare_zero_trust_access_policy" "enroll" {
  count = var.manage_device_enrollment && length(var.enroll_emails) > 0 ? 1 : 0

  account_id = var.account_id
  name       = "${local.worker_name}-enroll"
  decision   = "allow"
  include    = [for email in var.enroll_emails : { email = { email = email } }]
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

resource "terraform_data" "enrollment_original" {
  count = var.manage_device_enrollment ? 1 : 0

  input = [
    for policy in coalesce(try(local.existing_enroll_app.policies, null), []) :
    { id = policy.id, precedence = policy.precedence }
  ]

  lifecycle {
    ignore_changes = [input]
  }
}

locals {
  enroll_originals = try(terraform_data.enrollment_original[0].output, [])
  enroll_policies = concat(local.enroll_originals, [
    for policy in cloudflare_zero_trust_access_policy.enroll : {
      id         = policy.id
      precedence = max(0, [for original in local.enroll_originals : original.precedence]...) + 1
    }
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
  policies                  = var.release_device_enrollment ? local.enroll_originals : local.enroll_policies
}
