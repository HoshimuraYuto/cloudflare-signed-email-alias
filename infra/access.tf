data "cloudflare_zero_trust_organization" "team" {
  account_id = var.account_id
}

data "cloudflare_zero_trust_access_service_token" "client" {
  account_id = var.account_id
  filter     = { name = var.service_token_name }
}

resource "cloudflare_zero_trust_device_posture_rule" "gateway" {
  account_id = var.account_id
  name       = "${local.worker_name}-gateway"
  type       = "gateway"
}

resource "cloudflare_zero_trust_access_policy" "api" {
  account_id = var.account_id
  name       = local.worker_name
  decision   = "non_identity"
  include    = [{ service_token = { token_id = data.cloudflare_zero_trust_access_service_token.client.id } }]
  require    = [{ device_posture = { integration_uid = cloudflare_zero_trust_device_posture_rule.gateway.id } }]
}

resource "cloudflare_zero_trust_access_application" "api" {
  account_id   = var.account_id
  name         = local.worker_name
  type         = "self_hosted"
  destinations = [{ type = "worker", worker_id = local.worker_id }]
  # Password managers send the token in this one header; Access accepts no other single header.
  read_service_tokens_from_header = "Authorization"
  # Import reads these back as false; leaving them unset makes every plan after an import show a diff.
  auto_redirect_to_identity = false
  enable_binding_cookie     = false
  options_preflight_bypass  = false
  policies                  = [{ id = cloudflare_zero_trust_access_policy.api.id, precedence = 1 }]
}
