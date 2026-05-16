variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "vm_name" {
  type = string
}

variable "allowed_ports" {
  type = map(object({
    port     = number
    priority = number
    protocol = string
  }))
}
