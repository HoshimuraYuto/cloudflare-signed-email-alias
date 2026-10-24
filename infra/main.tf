terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.1"
    }
  }

  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

provider "cloudflare" {}

locals {
  # Must match worker.name in cloudflare.config.ts.
  worker_name = "cloudflare-signed-email-alias"
  # Looked up from the list: the single-Worker data source returns the name as its id,
  # which Access rejects.
  worker_id = one([for worker in data.cloudflare_workers.all.result : worker.id if worker.name == local.worker_name])
}

data "cloudflare_workers" "all" {
  account_id = var.account_id
}

data "cloudflare_zone" "alias" {
  filter = { name = var.alias_domain }
}

resource "cloudflare_workers_custom_domain" "api" {
  account_id = var.account_id
  zone_id    = data.cloudflare_zone.alias.id
  hostname   = var.api_hostname
  service    = local.worker_name
}
