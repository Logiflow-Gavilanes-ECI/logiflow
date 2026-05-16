variable "resource_group_name" { type = string }
variable "location"            { type = string }
variable "vm_name"             { type = string }
variable "vm_size"             { type = string }
variable "admin_username"      { type = string }
variable "ssh_public_key"      { type = string }
variable "subnet_id"           { type = string }
variable "nsg_id"              { type = string }
variable "public_ip_id"        { type = string }
variable "nic_name" {
  type        = string
  description = "Network interface name (default matches Azure auto-naming)"
  default     = "logiflow-backend818"
}
