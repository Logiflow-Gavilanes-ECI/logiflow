variable "subscription_id" {
  description = "Azure subscription ID where resources live"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group that holds the backend infra"
  type        = string
  default     = "logiflow-rg"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus2"
}

variable "vm_name" {
  description = "Name of the backend VM and prefix for related resources"
  type        = string
  default     = "logiflow-backend"
}

variable "vm_size" {
  description = "Azure VM SKU"
  type        = string
  default     = "Standard_D2s_v3"
}

variable "admin_username" {
  description = "Linux admin user (used for SSH and cloud-init usermod)"
  type        = string
  default     = "ubuntu"
}

variable "ssh_public_key" {
  description = "OpenSSH public key contents (the .pub half of the team key)"
  type        = string
}

variable "allowed_ports" {
  description = "Inbound rules keyed by rule name (matches existing Azure NSG)"
  type = map(object({
    port     = number
    priority = number
    protocol = string
  }))
  default = {
    "default-allow-ssh" = { port = 22, priority = 1000, protocol = "Tcp" }
    "HTTP"              = { port = 80, priority = 1010, protocol = "Tcp" }
    "HTTPS"             = { port = 443, priority = 1020, protocol = "Tcp" }
    "Realtime"          = { port = 3001, priority = 1030, protocol = "*" }
    "Gateway"           = { port = 3002, priority = 1040, protocol = "*" }
  }
}
