variable "state_passphrase" {
  description = "Encrypts the state and plan files. At least 16 characters."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account that holds the Worker, the zone and Zero Trust."
  type        = string
}

variable "alias_domain" {
  description = "Zone used only for aliases. All of its mail goes to the Worker."
  type        = string
}

variable "api_hostname" {
  description = "Hostname inside the alias zone that serves the API, such as alias-api.example.com."
  type        = string

  validation {
    condition     = endswith(var.api_hostname, ".${var.alias_domain}")
    error_message = "api_hostname must be a subdomain of alias_domain."
  }
}

variable "forward_to" {
  description = "Mailbox that receives mail sent to valid aliases."
  type        = string
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
