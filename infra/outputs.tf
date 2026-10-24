output "worker_secrets" {
  description = "Values for the Worker secrets of the same names, except SIGNING_KEY."
  value = {
    ALIAS_DOMAINS      = var.alias_domain
    FORWARD_TO         = var.forward_to
    ACCESS_TEAM_DOMAIN = data.cloudflare_zero_trust_organization.team.auth_domain
    ACCESS_AUD         = cloudflare_zero_trust_access_application.api.aud
    ACCESS_CLIENT_ID   = data.cloudflare_zero_trust_access_service_token.client.client_id
  }
}

output "warp_include" {
  description = "Hosts the device profile must send through WARP. Add them yourself when manage_device_profile is false."
  value       = local.warp_include
}
