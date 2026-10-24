locals {
  warp_include = [
    { host = var.api_hostname, description = "Alias API" },
    { host = data.cloudflare_zero_trust_organization.team.auth_domain, description = "Access team domain, needed for device posture" },
  ]
}

resource "cloudflare_zero_trust_device_default_profile" "split_tunnel" {
  count = var.manage_device_profile ? 1 : 0

  account_id = var.account_id
  include    = local.warp_include
}
