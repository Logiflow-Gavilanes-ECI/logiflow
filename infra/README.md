# 🚀 LogiFlow Infrastructure — Terraform + DuckDNS + HTTPS

Production deployment using Terraform, Nginx reverse proxy, Let's Encrypt TLS, and DuckDNS dynamic DNS.

## Architecture

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│  Nginx (port 80 → 301 to 443)      │
│  Nginx (port 443 — TLS termination) │
│  ┌────────────────┬────────────────┐│
│  │ /api/*         │ /socket.io/*   ││
│  │ → gateway:3002 │ → realtime:3001││
│  └────────────────┴────────────────┘│
│  Let's Encrypt certificate (auto)   │
│  DuckDNS domain (auto-updated)      │
├─────────────────────────────────────┤
│  gateway  │  realtime  │  optimizer │
│  postgres │  redis     │  vroom     │
│  ai-predictor │  certbot (renewal)  │
└─────────────────────────────────────┘
```

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Terraform](https://www.terraform.io/) | 1.5+ | Infrastructure provisioning |
| [DuckDNS](https://www.duckdns.org/) | — | Free dynamic DNS subdomain |
| SSH access | — | Remote server with Docker |

## Setup

### 1. Register DuckDNS domain

1. Go to [duckdns.org](https://www.duckdns.org/) and log in
2. Create a subdomain (e.g., `logiflow`)
3. Copy your API token

### 2. Configure Terraform variables

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 3. Deploy

```bash
terraform init
terraform plan
terraform apply
```

This will:
1. Update DuckDNS to point your domain to the server IP
2. Generate production Docker Compose and Nginx configs
3. SSH into the server and run the deployment script
4. Obtain a Let's Encrypt TLS certificate
5. Start all services behind Nginx with HTTPS

### 4. Verify

```bash
# Check deployment outputs
terraform output

# Test HTTPS
curl https://logiflow.duckdns.org/api/v1/vehicles
```

## Endpoints

| Endpoint | URL |
|----------|-----|
| API | `https://<domain>.duckdns.org/api/v1` |
| WebSocket | `wss://<domain>.duckdns.org/socket.io` |
| Health | `https://<domain>.duckdns.org/health` |

## TLS Certificate Renewal

Certbot runs as a container and automatically renews the certificate every 12 hours (only when needed). No manual intervention required.

## File Structure

```
infra/
├── terraform/
│   ├── main.tf                  ← Core deployment logic
│   ├── variables.tf             ← Input variable definitions
│   ├── outputs.tf               ← Deployment URL outputs
│   ├── terraform.tfvars.example ← Example configuration
│   └── templates/
│       ├── docker-compose.prod.yml.tpl  ← Production compose template
│       └── nginx.conf.tpl              ← Nginx HTTPS config template
├── scripts/
│   └── deploy.sh                ← Server deployment script
├── generated/                   ← Terraform-generated files (gitignored)
└── README.md
```
