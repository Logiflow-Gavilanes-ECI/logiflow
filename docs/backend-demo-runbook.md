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

Production recommendation: keep `POST /auth/login` disabled. Use the container-based token below for internal smoke tests.

Option A (only if `/auth/login` is available):

```bash
curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}'
```

Option B (recommended for the VM): generate a short-lived JWT inside the gateway container (does not expose `JWT_SECRET`).

```bash
TOKEN=$(docker-compose -f docker-compose.prod.yml exec -T gateway node -e "const jwt=require('jsonwebtoken'); const payload={sub:'demo-user', username:'demo', role:'admin'}; console.log(jwt.sign(payload, process.env.JWT_SECRET, {expiresIn:'10m'}));")
```

### 5.3 Authenticated end-to-end webhook (VROOM)

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

### 5.4 Redis verification

```bash
docker exec logiflow-redis redis-cli --raw KEYS 'route:vehicle:*'
docker exec logiflow-redis redis-cli --raw GET route:vehicle:v-001
```

Expected:

1. Key route:vehicle:v-001 exists.
2. Payload includes vehicleId v-001.

### 5.5 Log verification (evidence for stakeholders)

```bash
docker-compose -f docker-compose.prod.yml logs --tail 120 gateway
docker-compose -f docker-compose.prod.yml logs --tail 120 optimizer
docker-compose -f docker-compose.prod.yml logs --tail 120 realtime
```

Look for evidence of:

1. Gateway receives webhook with correlationId.
2. Gateway sends VRP to optimizer and receives routes code 0.
3. SocketClientService emits route-update.
4. Optimizer processes without timeout.

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
