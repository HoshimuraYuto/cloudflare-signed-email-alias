variable "state_passphrase" {
  description = "Encrypts the state and plan files; the scripts pass the encryption settings in TF_ENCRYPTION."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account that holds the Worker, the zone and Zero Trust."
  type        = string
}

variable "forwarding" {
  description = "Alias domain => inbox its mail goes to. Each domain is a zone used only for aliases."
  type        = map(string)

  validation {
    condition     = length(var.forwarding) > 0
    error_message = "List at least one alias domain."
  }
  validation {
    condition     = alltrue([for domain, inbox in var.forwarding : domain == lower(domain) && inbox == lower(inbox)])
    error_message = "Write the alias domains and inboxes in lower case."
  }
}

variable "api_subdomain" {
  description = "Name of the API hostname created in every alias domain."
  type        = string
  default     = "email-alias-api"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.api_subdomain))
    error_message = "api_subdomain must be one DNS label, such as email-alias-api."
  }
}

variable "manage_device_profile" {
  description = "Overwrite the account's default device profile with this project's split tunnel."
  type        = bool
  default     = false
}

variable "manage_gateway_proxy" {
  description = "Turn on the account's Gateway proxy, which the device posture check needs."
  type        = bool
  default     = false
}

variable "manage_device_enrollment" {
  description = "Add a policy allowing enroll_emails to the account's device enrollment permissions."
  type        = bool
  default     = false
}

variable "dmarc_policy" {
  description = "Publish a DMARC record with this policy on every alias domain; empty leaves DMARC alone."
  type        = string
  default     = ""

  validation {
    condition     = contains(["", "none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be none, quarantine or reject."
  }
}

variable "release_device_enrollment" {
  description = "Put the enrollment application's policies back as recorded; set by destroy."
  type        = bool
  default     = false
}

variable "enroll_emails" {
  description = "Addresses that may enroll devices when manage_device_enrollment is true."
  type        = list(string)
  default     = []
}
