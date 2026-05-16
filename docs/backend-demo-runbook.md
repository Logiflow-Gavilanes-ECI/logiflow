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

### 4.2 Full n8n end-to-end validation

This is the recommended command sequence for stakeholder demos. It validates the full production-like backend path:

```text
public POST /webhook/logiflow/traffic-event
-> Nginx
-> n8n workflow
-> Gateway /api/v1/webhook
-> Optimizer gRPC
-> VROOM
-> Realtime Socket.io
-> Redis route:vehicle:* keys
```

Start from the VM project directory and define the public base URL:

```bash
cd /home/ubuntu/logiflow
export BASE_URL=https://logiflow-api.eastus2.cloudapp.azure.com
```

Bring the stack up with the current compose definition. This restarts changed services without deleting database, Redis, or n8n volumes:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml ps
```

Expected service state:

1. `gateway`, `optimizer`, `realtime`, `n8n`, `redis`, `postgres`, `vroom`, and `ai-predictor` are `Up`.
2. `redis`, `postgres`, `optimizer`, and `vroom` are healthy when health status is shown.
3. `openclaw` may be present and healthy, but it is not required for the current n8n -> gateway route optimization flow.

Check public Gateway health:

```bash
curl -sS -i "$BASE_URL/api/v1/health"
```

Expected:

1. HTTP 200.
2. Body contains `"status":"ok"`.

Check that Nginx is routing the public n8n webhook path to n8n:

```bash
sudo nginx -t
sudo nginx -T | grep -n "server_name\|location /webhook/\|proxy_pass http://127.0.0.1:5678"
```

Expected:

1. Nginx syntax is OK.
2. The active config contains `location /webhook/`.
3. That location proxies to `http://127.0.0.1:5678`.

Check that n8n imported and activated the workflow:

```bash
docker-compose -f docker-compose.prod.yml logs --tail 120 n8n
docker-compose -f docker-compose.prod.yml exec -T n8n n8n list:workflow
```

Expected:

1. Logs include `Successfully imported 1 workflow`.
2. Logs include `Start Active Workflows`.
3. Logs include `Traffic Event Trigger - LogiFlow` or `Traffic Event Trigger – LogiFlow`.
4. `n8n list:workflow` prints `logiflow-traffic-event-trigger|Traffic Event Trigger`.

Optional: clear the demo route keys before triggering the full flow, so the Redis evidence is fresh:

```bash
set -a
source .env
set +a

docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw DEL route:vehicle:v-001 route:vehicle:v-002
docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw KEYS 'route:vehicle:*'
```

Trigger the full public n8n flow:

```bash
curl -sS -i -X POST "$BASE_URL/webhook/logiflow/traffic-event" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-full-smoke-001' \
  --data-binary @services/automation/sample-data/traffic-event.json
```

Expected immediate response:

```json
{"message":"Workflow was started"}
```

n8n uses `responseMode: onReceived`, so the 200 response only confirms the workflow accepted the event. Give the async execution a few seconds, then inspect service evidence:

```bash
sleep 5
docker-compose -f docker-compose.prod.yml logs --tail 220 gateway optimizer realtime n8n | grep -E "Incoming webhook|Received event|Sending VRP|Optimizer returned|Emitted route-update|Route update emitted|optimize_started|optimize_completed|Start Active Workflows|Successfully imported"
```

Expected log evidence:

1. Gateway logs `Incoming webhook: traffic_jam`.
2. Gateway logs `vehicles: 2 | jobs: 2`.
3. Gateway logs `Optimizer returned 2 routes, code: 0`.
4. Gateway logs `Emitted route-update: 2 routes`.
5. Optimizer logs `optimize_started` with `vehicles:2` and `jobs:2`.
6. Optimizer logs `optimize_completed` with `routes:2`.
7. Realtime logs `Route update emitted for vehicle v-001`.
8. Realtime logs `Route update emitted for vehicle v-002`.

Verify route persistence in Redis:

```bash
docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw KEYS 'route:vehicle:*'
docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw GET route:vehicle:v-001
docker exec -e REDISCLI_AUTH="$DB_PASSWORD" logiflow-redis redis-cli --raw GET route:vehicle:v-002
```

Expected Redis evidence:

1. Keys include `route:vehicle:v-001`.
2. Keys include `route:vehicle:v-002`.
3. The `v-001` payload contains `"vehicleId":"v-001"`.
4. The `v-002` payload contains `"vehicleId":"v-002"`.
5. Both payloads have a recent `persistedAt`.

Optional control test: bypass n8n and call Gateway directly with JWT. Use this only to isolate Gateway/Optimizer/Realtime issues from n8n issues:

```bash
TOKEN=$(docker-compose -f docker-compose.prod.yml exec -T gateway node -e "const jwt=require('jsonwebtoken'); const payload={sub:'demo-user', username:'demo', role:'admin'}; console.log(jwt.sign(payload, process.env.JWT_SECRET, {expiresIn:'10m'}));")

curl -sS -X POST "$BASE_URL/api/v1/webhook" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: direct-gateway-smoke-001' \
  -d '{
    "eventType":"traffic_jam",
    "vehicles":[
      { "id":"v-001", "lat":4.711, "lng":-74.072, "capacity":10 }
    ],
    "stops":[
      { "id":"s-101", "lat":4.705, "lng":-74.068, "demand":2, "priority":1 }
    ]
  }'
```

## 5. Backend demo smoke tests

The commands in this section are extra smoke/debug checks. For a normal stakeholder demo, section 4.2 is enough. Do not run troubleshooting reset blocks unless the expected error is actually present.

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

The webhook is protected with JWT. On the deployed VM, use the Linux/macOS commands. The PowerShell/curl.exe examples are only for running the same smoke test from a Windows terminal, not from the VM bash shell.

For PowerShell/curl.exe, first request a token:

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

Troubleshooting only: if the import logs show `SQLITE_ERROR: no such column: User.role`, the `n8n_data` volume was likely created by a different n8n version before the image was pinned. Do not run this block when `n8n list:workflow` already prints the workflow. Back up and recreate only the n8n volume:

```bash
docker volume ls | grep n8n

mkdir -p backups
docker-compose -f docker-compose.prod.yml stop n8n
docker run --rm \
  -v logiflow_n8n_data:/data \
  -v "$PWD/backups:/backup" \
  alpine sh -c 'tar czf /backup/n8n_data_$(date +%Y%m%d_%H%M%S).tgz -C /data .'

docker-compose -f docker-compose.prod.yml rm -sf n8n
docker volume rm logiflow_n8n_data
docker-compose -f docker-compose.prod.yml up -d n8n
docker-compose -f docker-compose.prod.yml logs -f n8n
```

Wait until the n8n logs show both `n8n ready` and `=> Started`, then stop following logs with `Ctrl+C` and run:

```bash
docker-compose -f docker-compose.prod.yml exec -T n8n n8n list:workflow
```

After the reset, `n8n list:workflow` should print the imported workflow instead of returning an empty response.

If you run `n8n list:workflow` too early and get `SQLITE_BUSY: database is locked`, n8n was still migrating/importing. Wait for it to finish or restart only n8n:

```bash
docker-compose -f docker-compose.prod.yml restart n8n
docker-compose -f docker-compose.prod.yml logs -f n8n
```

Again, wait for `n8n ready` and `=> Started` before testing the webhook.

Trigger the workflow from inside the VM:

```bash
curl -sS -i -X POST "http://localhost:5678/webhook/logiflow/traffic-event" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-smoke-001' \
  --data-binary @services/automation/sample-data/traffic-event.json
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
  --data-binary @services/automation/sample-data/traffic-event.json
```

If this returns `Cannot POST /webhook/logiflow/traffic-event`, Nginx is forwarding `/webhook/*` to the gateway instead of n8n. This block is Nginx configuration, not a shell command. Add it inside the HTTPS `server { ... }` block on the VM, before the catch-all `location /`, then reload Nginx:

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

Useful commands to find and edit the active config:

```bash
sudo nginx -T | grep -n "server_name\|proxy_pass\|configuration file"
sudo mkdir -p /etc/nginx/backups
sudo cp /etc/nginx/sites-enabled/logiflow /etc/nginx/backups/logiflow.bak.$(date +%Y%m%d_%H%M%S)
sudo nano /etc/nginx/sites-enabled/logiflow
```

Keep backup files outside `/etc/nginx/sites-enabled`; Nginx loads every file in that directory.

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

## 7. Optional Telegram notification validation

The current n8n workflow has a direct `Notify via Telegram` branch for HIGH or CRITICAL risk events. This is independent from the re-optimization branch: Telegram can fail while `POST to Webhook`, route optimization, realtime, and Redis still succeed.

After adding or changing `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` in `.env`, recreate n8n so the container receives the new environment variables:

```bash
docker-compose -f docker-compose.prod.yml up -d --force-recreate n8n
docker-compose -f docker-compose.prod.yml logs -f n8n
```

Wait for `n8n ready` and `=> Started`, then stop following logs with `Ctrl+C`.

Confirm the variables exist inside the n8n container without printing secret values:

```bash
docker-compose -f docker-compose.prod.yml exec -T n8n sh -lc '[ -n "$TELEGRAM_BOT_TOKEN" ] && echo "TELEGRAM_BOT_TOKEN=present" || echo "TELEGRAM_BOT_TOKEN=missing"; [ -n "$TELEGRAM_CHAT_ID" ] && echo "TELEGRAM_CHAT_ID=present" || echo "TELEGRAM_CHAT_ID=missing"'
```

Send a direct Telegram smoke message from inside the n8n container:

```bash
docker-compose -f docker-compose.prod.yml exec -T n8n node -e "const https=require('https'); const token=process.env.TELEGRAM_BOT_TOKEN; const chatId=process.env.TELEGRAM_CHAT_ID; if(!token||!chatId){console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'); process.exit(1);} const body=JSON.stringify({chat_id:chatId,text:'LogiFlow Telegram smoke '+new Date().toISOString()}); const req=https.request({hostname:'api.telegram.org',path:'/bot'+token+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{console.log('status='+res.statusCode); console.log(data);});}); req.on('error',err=>{console.error(err.message); process.exit(1);}); req.write(body); req.end();"
```

Expected:

1. `status=200`.
2. Telegram response includes `"ok":true`.
3. The configured chat receives the smoke message.

Common Telegram failures:

1. `401 Unauthorized`: bot token is invalid or was revoked.
2. `400 Bad Request: chat not found`: chat ID is wrong, or the user has not opened the bot and sent `/start`.
3. `403 Forbidden`: the bot was blocked or removed from the chat.

After direct Telegram succeeds, run the full n8n event again with a CRITICAL payload:

```bash
curl -sS -i -X POST "$BASE_URL/webhook/logiflow/traffic-event" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-telegram-smoke-001' \
  --data-binary @services/automation/sample-data/traffic-event.json
```

In the n8n GUI, the `Notify via Telegram` node should return a Telegram payload with `"ok": true`, and the `Notification Delivered?` node should take the success branch.

## 8. Optional n8n GUI test scenarios

Use these scenarios when you want to watch the workflow execute node by node in the n8n editor.

GUI steps for every scenario:

1. Open the `Traffic Event Trigger - LogiFlow` workflow.
2. Go back to the canvas.
3. Click `Test workflow`.
4. Run exactly one `curl` against `/webhook-test/logiflow/traffic-event`.
5. Wait for the nodes to turn green or red.
6. Click individual nodes to inspect input/output.
7. To run another scenario, click `Test workflow` again before sending the next `curl`.

The test webhook is one-shot. If you send a second request without clicking `Test workflow` again, n8n returns 404 for the test URL.

Set the test URL:

```bash
cd /home/ubuntu/logiflow
export N8N_TEST_URL=http://localhost:5678/webhook-test/logiflow/traffic-event
```

### 8.1 CRITICAL traffic event - reoptimize and notify Telegram

Expected visual path:

1. Main route optimization branch succeeds.
2. `Risk Matrix Switch` takes the notification branch.
3. `Notify via Telegram` succeeds.
4. `Notification Delivered?` takes the success branch.
5. `Success - Route Re-optimization` succeeds.

```bash
curl -sS -i -X POST "$N8N_TEST_URL" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-gui-critical-traffic' \
  --data-binary @services/automation/sample-data/traffic-event.json
```

### 8.2 HIGH traffic jam - reoptimize but skip notification

The risk matrix maps `HIGH + traffic_jam` to `MEDIUM`, so the notification branch should be skipped.

Expected visual path:

1. Main route optimization branch succeeds.
2. `Risk Matrix Switch` takes the false branch.
3. `Notification Skipped Log` succeeds.
4. `Notify via Telegram` is not executed.

```bash
curl -sS -i -X POST "$N8N_TEST_URL" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-gui-high-traffic' \
  -d '{
    "eventType": "traffic_jam",
    "severity": "HIGH",
    "locationDescription": "Autopista Norte - Calle 100, Bogotá",
    "vehicles": [
      { "id": "v-001", "lat": 4.711, "lng": -74.0721, "capacity": 12 },
      { "id": "v-002", "lat": 4.695, "lng": -74.063, "capacity": 8 }
    ],
    "stops": [
      { "id": "s-101", "lat": 4.705, "lng": -74.068, "demand": 2, "priority": 1 },
      { "id": "s-102", "lat": 4.688, "lng": -74.056, "demand": 3, "priority": 2 }
    ]
  }'
```

### 8.3 LOW weather alert - map to gateway `weather_change`

Expected visual path:

1. `Evaluate Risk Matrix` outputs `riskLevel: LOW`.
2. `Assess Detour` maps the gateway event type to `weather_change`.
3. Main route optimization branch succeeds.
4. Notification is skipped.

```bash
curl -sS -i -X POST "$N8N_TEST_URL" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-gui-low-weather' \
  -d '{
    "eventType": "weather_alert",
    "severity": "LOW",
    "locationDescription": "Avenida El Dorado, Bogotá, Colombia",
    "vehicles": [
      { "id": "v-001", "lat": 4.711, "lng": -74.0721, "capacity": 12 }
    ],
    "stops": [
      { "id": "s-weather-1", "lat": 4.701, "lng": -74.09, "demand": 1, "priority": 1 }
    ]
  }'
```

### 8.4 CRITICAL road closure - map to gateway `traffic_jam` and notify

Expected visual path:

1. `Evaluate Risk Matrix` outputs `riskLevel: HIGH`.
2. `Assess Detour` maps `road_closure` to gateway `traffic_jam`.
3. Main route optimization branch succeeds.
4. Telegram notification succeeds when Telegram env vars are configured.

```bash
curl -sS -i -X POST "$N8N_TEST_URL" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-gui-road-closure' \
  -d '{
    "eventType": "road_closure",
    "severity": "CRITICAL",
    "locationDescription": "Carrera Séptima con Calle 72, Bogotá, Colombia",
    "vehicles": [
      { "id": "v-001", "lat": 4.711, "lng": -74.0721, "capacity": 12 },
      { "id": "v-002", "lat": 4.695, "lng": -74.063, "capacity": 8 }
    ],
    "stops": [
      { "id": "s-closure-1", "lat": 4.657, "lng": -74.06, "demand": 2, "priority": 1 },
      { "id": "s-closure-2", "lat": 4.676, "lng": -74.048, "demand": 2, "priority": 2 }
    ]
  }'
```

### 8.5 Invalid payload - see failure handling

Use this to inspect how a bad event fails. Expected result: the workflow should fail or stop around `POST to Webhook`, because the gateway requires at least one vehicle.

```bash
curl -sS -i -X POST "$N8N_TEST_URL" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: n8n-gui-invalid-payload' \
  -d '{
    "eventType": "traffic_jam",
    "severity": "MEDIUM",
    "locationDescription": "Invalid payload test",
    "vehicles": [],
    "stops": [
      { "id": "s-invalid-1", "lat": 4.705, "lng": -74.068, "demand": 1, "priority": 1 }
    ]
  }'
```

## 9. Common issues and solutions

### 9.1 npm install fails with EACCES in realtime

If services/realtime/node_modules was left with root ownership from running in a container:

```bash
docker run --rm -v "$PWD":/workspace alpine sh -c "chown -R $(id -u):$(id -g) /workspace/services/realtime/node_modules"
```

### 9.2 Socket does not connect (Unauthorized)

1. Verify that realtime has JWT_SECRET in compose.
2. Verify that gateway uses the same JWT_SECRET.

### 9.3 Optimizer does not write to Redis

1. Confirm REDIS_URL in optimizer.
2. Check optimizer logs for persistence errors.

## 10. Shutdown commands

```bash
docker-compose -f docker-compose.prod.yml down --remove-orphans
```

If you want to preserve DB/Redis state for a second demo, skip down and leave the containers running.
