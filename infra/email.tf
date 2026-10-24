resource "cloudflare_email_routing_dns" "alias" {
  zone_id = data.cloudflare_zone.alias.id
}

resource "cloudflare_email_routing_address" "destination" {
  account_id = var.account_id
  email      = var.forward_to
}

data "cloudflare_email_routing_catch_all" "current" {
  zone_id = data.cloudflare_zone.alias.id
}

locals {
  catch_all_is_ours = anytrue([
    for action in coalesce(data.cloudflare_email_routing_catch_all.current.actions, []) :
    action.type == "worker" && contains(coalesce(action.value, []), local.worker_name)
  ])
}

# Catch-all rules exist only on a zone apex, which is why the zone must be dedicated to aliases.
resource "cloudflare_email_routing_catch_all" "alias" {
  zone_id  = data.cloudflare_zone.alias.id
  name     = local.worker_name
  enabled  = true
  matchers = [{ type = "all" }]
  actions  = [{ type = "worker", value = [local.worker_name] }]

  depends_on = [cloudflare_email_routing_dns.alias]

  lifecycle {
    precondition {
      condition     = data.cloudflare_email_routing_catch_all.current.enabled != true || local.catch_all_is_ours
      error_message = "The alias zone already sends its catch-all somewhere else. Use a zone dedicated to aliases."
    }
  }
}
