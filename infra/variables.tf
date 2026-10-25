variable "state_passphrase" {
  description = "Encrypts the state and plan files. At least 16 characters."
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

variable "manage_device_enrollment" {
  description = "Replace the account's device enrollment permissions with a policy allowing enroll_emails."
  type        = bool
  default     = false
}

variable "enroll_emails" {
  description = "Addresses that may enroll devices when manage_device_enrollment is true."
  type        = list(string)
  default     = []
}
