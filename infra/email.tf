resource "cloudflare_email_routing_dns" "alias" {
  for_each = local.zone_ids

  zone_id = each.value
}

# Destination addresses belong to the account, so two domains may share one inbox.
resource "cloudflare_email_routing_address" "destination" {
  for_each = toset(values(var.forwarding))

  account_id = var.account_id
  email      = each.value
}

data "cloudflare_email_routing_catch_all" "current" {
  for_each = local.zone_ids

  zone_id = each.value
}

locals {
  catch_all_is_ours = {
    for domain, catch_all in data.cloudflare_email_routing_catch_all.current : domain => anytrue([
      for action in coalesce(catch_all.actions, []) :
      action.type == "worker" && contains(coalesce(action.value, []), local.worker_name)
    ])
  }
}

# Catch-all rules exist only on a zone apex, which is why each zone must be dedicated to aliases.
resource "cloudflare_email_routing_catch_all" "alias" {
  for_each = local.zone_ids

  zone_id  = each.value
  name     = local.worker_name
  enabled  = true
  matchers = [{ type = "all" }]
  actions  = [{ type = "worker", value = [local.worker_name] }]

  depends_on = [cloudflare_email_routing_dns.alias]

  lifecycle {
    precondition {
      condition     = data.cloudflare_email_routing_catch_all.current[each.key].enabled != true || local.catch_all_is_ours[each.key]
      error_message = "${each.key} already sends its catch-all somewhere else. Use a zone dedicated to aliases."
    }
  }
}
