variable "duckdns_domain" {
  description = "DuckDNS subdomain (without .duckdns.org)"
  type        = string
}

variable "duckdns_token" {
  description = "DuckDNS API token for DNS updates"
  type        = string
  sensitive   = true
}

variable "letsencrypt_email" {
  description = "Email for Let's Encrypt certificate notifications"
  type        = string
}

variable "server_ip" {
  description = "Public IP of the deployment server"
  type        = string
}

variable "ssh_user" {
  description = "SSH username for the deployment server"
  type        = string
  default     = "ubuntu"
}

variable "ssh_private_key_path" {
  description = "Path to SSH private key for server access"
  type        = string
  default     = "~/.ssh/id_rsa"
}

variable "jwt_secret" {
  description = "JWT signing secret for Gateway auth"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Deployment environment (production, staging)"
  type        = string
  default     = "production"
}
