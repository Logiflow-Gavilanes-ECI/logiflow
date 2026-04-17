#!/usr/bin/env bash
set -euo pipefail

FQDN="${1:?Usage: deploy.sh <fqdn> <email>}"
EMAIL="${2:?Usage: deploy.sh <fqdn> <email>}"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== LogiFlow Production Deployment ==="
echo "Domain: $FQDN"
echo "Email:  $EMAIL"
echo ""

install_docker() {
    if command -v docker &>/dev/null; then
        echo "[ok] Docker already installed"
        return
    fi
    echo "[install] Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "[ok] Docker installed"
}

obtain_certificate() {
    local cert_path="$DEPLOY_DIR/certbot/conf/live/$FQDN/fullchain.pem"

    if [ -f "$cert_path" ]; then
        echo "[ok] TLS certificate already exists"
        return
    fi

    echo "[tls] Obtaining Let's Encrypt certificate..."

    mkdir -p "$DEPLOY_DIR/certbot/conf" "$DEPLOY_DIR/certbot/www"

    cat > "$DEPLOY_DIR/nginx/conf.d/default.conf" <<NGINX_TEMP
server {
    listen 80;
    server_name $FQDN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'waiting for certificate';
        add_header Content-Type text/plain;
    }
}
NGINX_TEMP

    docker compose up -d nginx
    sleep 3

    docker compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$FQDN"

    docker compose down nginx

    echo "[ok] TLS certificate obtained"
}

deploy_services() {
    echo "[deploy] Starting all services..."
    cd "$DEPLOY_DIR"
    docker compose pull --ignore-buildable 2>/dev/null || true
    docker compose up -d --build --remove-orphans
    echo "[ok] All services started"
}

verify_deployment() {
    echo ""
    echo "[verify] Waiting for services to initialize..."
    sleep 10

    echo "[verify] Checking HTTPS..."
    local status
    status=$(curl -sk -o /dev/null -w "%{http_code}" "https://$FQDN/health" 2>/dev/null || echo "000")

    if [ "$status" = "200" ] || [ "$status" = "401" ]; then
        echo "[ok] HTTPS is working (status: $status)"
    else
        echo "[warn] HTTPS returned status $status — gateway may still be starting"
        echo "       Check logs: docker compose logs gateway --tail 20"
    fi

    echo ""
    echo "=== Deployment Complete ==="
    echo ""
    echo "  HTTPS:     https://$FQDN"
    echo "  API:       https://$FQDN/api/v1"
    echo "  Socket:    wss://$FQDN/socket.io"
    echo ""
    echo "  Logs:      docker compose logs -f"
    echo "  Status:    docker compose ps"
    echo ""
}

cd "$DEPLOY_DIR"
install_docker
obtain_certificate
deploy_services
verify_deployment
