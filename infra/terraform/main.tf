terraform {
  required_version = ">= 1.5"

  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

locals {
  fqdn         = "${var.duckdns_domain}.duckdns.org"
  project_name = "logiflow"
  deploy_path  = "/opt/${local.project_name}"
}

resource "local_file" "docker_compose_prod" {
  filename = "${path.module}/../generated/docker-compose.prod.yml"
  content  = templatefile("${path.module}/templates/docker-compose.prod.yml.tpl", {
    db_password = var.db_password
    jwt_secret  = var.jwt_secret
    fqdn        = local.fqdn
  })
}

resource "local_file" "nginx_conf" {
  filename = "${path.module}/../generated/nginx.conf"
  content  = templatefile("${path.module}/templates/nginx.conf.tpl", {
    fqdn = local.fqdn
  })
}

resource "local_file" "env_file" {
  filename        = "${path.module}/../generated/.env.production"
  file_permission = "0600"
  content         = <<-EOF
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=${var.db_password}
    POSTGRES_DB=logiflow_gateway
    JWT_SECRET=${var.jwt_secret}
    JWT_EXPIRES_IN=1h
    DUCKDNS_DOMAIN=${var.duckdns_domain}
    DUCKDNS_TOKEN=${var.duckdns_token}
    LETSENCRYPT_EMAIL=${var.letsencrypt_email}
    ENVIRONMENT=${var.environment}
  EOF
}

resource "null_resource" "duckdns_update" {
  triggers = {
    server_ip = var.server_ip
    domain    = var.duckdns_domain
  }

  provisioner "local-exec" {
    command = "curl -s \"https://www.duckdns.org/update?domains=${var.duckdns_domain}&token=${var.duckdns_token}&ip=${var.server_ip}\""
  }
}

resource "null_resource" "deploy" {
  depends_on = [
    local_file.docker_compose_prod,
    local_file.nginx_conf,
    local_file.env_file,
    null_resource.duckdns_update,
  ]

  triggers = {
    always_run = timestamp()
  }

  connection {
    type        = "ssh"
    host        = var.server_ip
    user        = var.ssh_user
    private_key = file(var.ssh_private_key_path)
    timeout     = "5m"
  }

  provisioner "remote-exec" {
    inline = [
      "mkdir -p ${local.deploy_path}/nginx/conf.d",
      "mkdir -p ${local.deploy_path}/certbot/conf",
      "mkdir -p ${local.deploy_path}/certbot/www",
    ]
  }

  provisioner "file" {
    source      = "${path.module}/../generated/docker-compose.prod.yml"
    destination = "${local.deploy_path}/docker-compose.yml"
  }

  provisioner "file" {
    source      = "${path.module}/../generated/nginx.conf"
    destination = "${local.deploy_path}/nginx/conf.d/default.conf"
  }

  provisioner "file" {
    source      = "${path.module}/../generated/.env.production"
    destination = "${local.deploy_path}/.env"
  }

  provisioner "file" {
    source      = "${path.module}/../scripts/deploy.sh"
    destination = "${local.deploy_path}/deploy.sh"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod +x ${local.deploy_path}/deploy.sh",
      "cd ${local.deploy_path} && bash deploy.sh ${local.fqdn} ${var.letsencrypt_email}",
    ]
  }
}
