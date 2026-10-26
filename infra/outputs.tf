output "worker_secrets" {
  description = "Access values for the Worker secrets of the same names."
  value = {
    ACCESS_TEAM_DOMAIN = data.cloudflare_zero_trust_organization.team.auth_domain
    ACCESS_AUD         = cloudflare_zero_trust_access_application.api.aud
    ACCESS_CLIENT_ID   = cloudflare_zero_trust_access_service_token.client.client_id
  }
}

output "warp_include" {
  description = "Hosts the device profile must send through WARP. Add them yourself when manage_device_profile is false."
  value       = local.warp_include
}

output "service_token" {
  description = "Client ID and secret the password manager sends to the API."
  value = {
    client_id     = cloudflare_zero_trust_access_service_token.client.client_id
    client_secret = cloudflare_zero_trust_access_service_token.client.client_secret
  }
  sensitive = true
}

output "shared_originals" {
  description = "Account-wide settings as they were before this project changed them; destroy restores these."
  value = {
    split_tunnel  = try(terraform_data.split_tunnel_original[0].output, null)
    gateway_proxy = try(terraform_data.gateway_proxy_original[0].output, null)
  }
}
