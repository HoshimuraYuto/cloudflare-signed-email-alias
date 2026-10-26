data "cloudflare_dns_records" "dmarc" {
  for_each = var.dmarc_policy == "" ? {} : local.zone_ids

  zone_id = each.value
  type    = "TXT"
  name    = { exact = "_dmarc.${each.key}" }
}

resource "cloudflare_dns_record" "dmarc" {
  for_each = data.cloudflare_dns_records.dmarc

  zone_id = local.zone_ids[each.key]
  name    = "_dmarc.${each.key}"
  type    = "TXT"
  ttl     = 1 # automatic
  content = "v=DMARC1; p=${var.dmarc_policy}"
  # Marks the record as this project's, so a later deploy can tell it from one made by hand.
  comment = local.worker_name

  lifecycle {
    precondition {
      # A second DMARC record would make receivers ignore both.
      condition     = alltrue([for record in coalesce(each.value.result, []) : record.comment == local.worker_name])
      error_message = "${each.key} already has a DMARC record. Remove it, or leave DMARC_POLICY unset."
    }
  }
}
