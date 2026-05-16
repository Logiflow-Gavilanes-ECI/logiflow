output "vm_id" {
  value = azurerm_linux_virtual_machine.main.id
}

output "nic_id" {
  value = azurerm_network_interface.main.id
}
