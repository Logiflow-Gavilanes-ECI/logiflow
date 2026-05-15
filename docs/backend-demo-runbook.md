# Backend Demo Manual - LogiFlow

This document describes how to run a functional LogiFlow demo against the deployed VM (backend only, no frontend).

## 1. Demo objective

Validate the complete backend flow end-to-end:

1. Authentication in Gateway.
2. Authenticated webhook reception.
3. Route optimization via Optimizer + VROOM.
4. Real-time event emission.
5. Route persistence per vehicle in Redis with canonical key.

## 2. Prerequisites

1. SSH access to the VM that runs the stack.
2. Docker and Docker Compose installed on the VM.
3. `curl` available on the VM.

## 3. Expected service state (deployed VM)

Public endpoint:

1. Gateway: https://logiflow-api.eastus2.cloudapp.azure.com

Frontend (optional reference for OAuth UI only):

1. https://logiflowapp.z13.web.core.windows.net

The project does not use a custom frontend domain. Keep the public web admin URL on the Azure Storage Account endpoint above.

Required gateway env for the current web-admin demo:

```bash
CORS_ORIGINS=https://logiflowapp.z13.web.core.windows.net,http://localhost:4200,capacitor://localhost,http://localhost,https://localhost
GOOGLE_ADMIN_EMAILS=elizabethcorreasuarez@gmail.com
GOOGLE_REDIRECT_FRONTEND_ADMIN=https://logiflowapp.z13.web.core.windows.net
```

The gateway seed creates these demo identities after migrations:

1. Admin: `admin@logiflow.app` / `Admin2026!` / role `admin`.
2. Conductor 1: `conductor@logiflow.app` / `Driver2026!` / role `conductor` / vehicle `v-001` / plate `ABC-123`.
3. Conductor 2: `conductor2@logiflow.app` / `Driver2026!` / role `conductor` / vehicle `v-002` / plate `DEF-456`.

The conductor users are created with IDs matching their vehicles, so their JWTs contain `vehicleId: v-001` and `vehicleId: v-002`.

Internal service endpoints (containers):

1. Realtime: http://realtime:3001
2. VROOM: http://vroom:3000
3. AI Predictor: http://ai-predictor:5001
4. Redis: redis:6379
5. Postgres: postgres:5432

## 4. Manual validation pipeline

### 4.1 Stack status (VM)

```bash
cd /home/ubuntu/logiflow
docker-compose -f docker-compose.prod.yml ps
```

## 5. Backend demo smoke tests

### 5.1 Health check (public)

```bash
BASE_URL=https://logiflow-api.eastus2.cloudapp.azure.com
curl -sS -i "$BASE_URL/api/v1/health"
```

Expected:

1. Gateway responds 200 with status ok.

If you get 404, try the alternate health path used by some reverse-proxy configs:

```bash
curl -sS -i "$BASE_URL/health"
```

### 5.2 Obtain JWT for the webhook

The seed runs automatically in the gateway container startup command. If you need to run it manually inside the VM:

```bash
docker-compose -f docker-compose.prod.yml exec -T gateway npm run db:seed
```

Then log in with email/password.

Admin login:

```bash
curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@logiflow.app","password":"Admin2026!"}'
```

Conductor login:

```bash
curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"conductor@logiflow.app","password":"Driver2026!"}'
```

Second conductor login:

```bash
curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"conductor2@logiflow.app","password":"Driver2026!"}'
```

Expected response:

```json
{
  "accessToken": "<jwt>",
  "role": "admin | conductor"
}
```

Fallback for internal smoke tests: generate a short-lived JWT inside the gateway container (does not expose `JWT_SECRET`).

```bash
TOKEN=$(docker-compose -f docker-compose.prod.yml exec -T gateway node -e "const jwt=require('jsonwebtoken'); const payload={sub:'demo-user', username:'demo', role:'admin'}; console.log(jwt.sign(payload, process.env.JWT_SECRET, {expiresIn:'10m'}));")
```

### 5.3 Authenticated end-to-end webhook (VROOM)

The webhook is protected with JWT. For PowerShell/curl.exe, first request a token:

```powershell
$TOKEN = (curl.exe -sS -X POST "$BASE_URL/api/v1/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@logiflow.app\",\"password\":\"Admin2026!\"}' | ConvertFrom-Json).accessToken
```

Then send the webhook event:

```powershell
curl.exe -X POST "$BASE_URL/api/v1/webhook" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{\"eventType\":\"traffic_jam\",\"vehicles\":[{\"id\":\"v-001\",\"lat\":4.711,\"lng\":-74.0721,\"capacity\":100}],\"stops\":[{\"id\":\"s-1\",\"lat\":4.720,\"lng\":-74.065,\"demand\":10,\"priority\":1},{\"id\":\"s-2\",\"lat\":4.730,\"lng\":-74.060,\"demand\":10,\"priority\":2},{\"id\":\"s-3\",\"lat\":4.740,\"lng\":-74.055,\"demand\":10,\"priority\":3}]}'
```

For Linux/macOS shells:

```bash
curl -sS -X POST "$BASE_URL/api/v1/webhook" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: vroom-smoke-001' \
  -d '{
    "eventType":"traffic_jam",
    "departureTime":"2026-04-09T17:30:00Z",
    "vehicles":[
      {
        "id":"v-001",
        "lat":4.711,
        "lng":-74.072,
        "capacity":10
      }
    ],
    "stops":[
      {
        "id":"s-101",
        "lat":4.705,
        "lng":-74.068,
        "demand":2,
        "priority":1
      }
    ]
  }'
```

Expected response:

1. received true.
2. fallback false (optimizer + VROOM reachable).
3. optimizedRoutes.code equal to 0.
4. routes[0].vehicleId equal to v-001.

### 5.4 n8n automation path

Use this only after confirming the direct gateway path in section 5.3 works. This validates the product automation path:

```text
external event -> n8n webhook -> gateway -> optimizer/VROOM -> realtime -> Redis
```

Confirm n8n is running and the workflow was imported:

```bash
docker-compose -f docker-compose.prod.yml ps n8n
docker-compose -f docker-compose.prod.yml logs --tail 120 n8n
docker-compose -f docker-compose.prod.yml exec -T n8n n8n list:workflow
```

Expected log evidence:

1. `[entrypoint] importing workflows from /workflows`
2. `[entrypoint] activating imported workflows`
3. `Traffic Event Trigger` listed by the n8n CLI.

Trigger the workflow from inside the VM:

```bash
curl -sS -i -X POST "http://localhost:5678/webhook/logiflow/traffic-event" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-smoke-001' \
  --data @services/automation/sample-data/traffic-event.json
```

Expected:

1. n8n responds 2xx.
2. Gateway logs an inbound `POST /api/v1/webhook`.
3. Realtime logs route updates for `v-001` and `v-002`.

Public webhook check:

```bash
curl -sS -i -X POST "$BASE_URL/webhook/logiflow/traffic-event" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-public-smoke-001' \
  --data @services/automation/sample-data/traffic-event.json
```

If this returns `Cannot POST /webhook/logiflow/traffic-event`, Nginx is forwarding `/webhook/*` to the gateway instead of n8n. Add a reverse-proxy location on the VM that sends `/webhook/` to `http://127.0.0.1:5678`, then reload Nginx:

```nginx
location /webhook/ {
    proxy_pass http://127.0.0.1:5678;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5.5 Redis verification

```bash
set -a
source .env
set +a

docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw KEYS 'route:vehicle:*'
docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw GET route:vehicle:v-001
```

Expected:

1. Key route:vehicle:v-001 exists.
2. Payload includes vehicleId v-001.

### 5.6 Log verification (evidence for stakeholders)

```bash
docker-compose -f docker-compose.prod.yml logs --tail 120 gateway
docker-compose -f docker-compose.prod.yml logs --tail 120 optimizer
docker-compose -f docker-compose.prod.yml logs --tail 120 realtime
docker-compose -f docker-compose.prod.yml logs --tail 120 n8n
```

Look for evidence of:

1. Gateway receives webhook with correlationId.
2. Gateway sends VRP to optimizer and receives routes code 0.
3. SocketClientService emits route-update.
4. Optimizer processes without timeout.
5. n8n receives the external webhook and calls `WEBHOOK_TARGET`.

## 6. Optional demo with and without AI (backend only)

By default in production compose, AI_PREDICTOR_ENABLED may be set to true or false depending on the VM .env.

To compare two runs:

1. Change AI_PREDICTOR_ENABLED in docker-compose.prod.yml (or the VM .env).
2. Rebuild optimizer:

```bash
docker-compose -f docker-compose.prod.yml up -d --build optimizer
```

3. Execute the same webhook twice (AI true and AI false) and compare matrixSource in response/logs.

## 7. Common issues and solutions

### 7.1 npm install fails with EACCES in realtime

If services/realtime/node_modules was left with root ownership from running in a container:

```bash
docker run --rm -v "$PWD":/workspace alpine sh -c "chown -R $(id -u):$(id -g) /workspace/services/realtime/node_modules"
```

### 7.2 Socket does not connect (Unauthorized)

1. Verify that realtime has JWT_SECRET in compose.
2. Verify that gateway uses the same JWT_SECRET.

### 7.3 Optimizer does not write to Redis

1. Confirm REDIS_URL in optimizer.
2. Check optimizer logs for persistence errors.

## 8. Shutdown commands

```bash
docker-compose -f docker-compose.prod.yml down --remove-orphans
```

If you want to preserve DB/Redis state for a second demo, skip down and leave the containers running.
