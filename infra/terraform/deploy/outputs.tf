output "deployment_url" {
  description = "HTTPS URL of the deployed LogiFlow instance"
  value       = "https://${local.fqdn}"
}

output "api_url" {
  description = "Gateway API endpoint"
  value       = "https://${local.fqdn}/api/v1"
}

output "socket_url" {
  description = "Realtime WebSocket endpoint"
  value       = "https://${local.fqdn}/socket.io"
}

output "duckdns_domain" {
  description = "DuckDNS domain configured"
  value       = local.fqdn
}
