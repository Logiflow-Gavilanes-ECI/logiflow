output "public_ip" {
  description = "Public IP address of the backend VM"
  value       = module.network.public_ip_address
}

output "vm_id" {
  description = "Azure resource ID of the VM"
  value       = module.vm.vm_id
}

output "ssh_command" {
  description = "Ready-to-paste SSH command (assumes key at ~/.ssh/logiflow-backend_key.pem)"
  value       = "ssh -i ~/.ssh/logiflow-backend_key.pem ${var.admin_username}@${module.network.public_ip_address}"
}
