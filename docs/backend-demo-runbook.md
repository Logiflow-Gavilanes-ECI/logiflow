# Backend Demo Manual - LogiFlow

This document describes how to run a functional LogiFlow demo using backend only (no frontend).

## 1. Demo objective

Validate the complete backend flow end-to-end:

1. Authentication in Gateway.
2. Authenticated webhook reception.
3. Route optimization via Optimizer + VROOM.
4. Real-time event emission.
5. Route persistence per vehicle in Redis with canonical key.

## 2. Prerequisites

1. Docker and Docker Compose installed.
2. Node 20+ and npm (for local prechecks).
3. Free ports: 3000, 3001, 3002, 5001, 50051, 5432, 6379.

## 3. Expected service state

After starting compose, the following services should be available:

1. Gateway: http://localhost:3002
2. Realtime: http://localhost:3001
3. VROOM: http://localhost:3000
4. AI Predictor: http://localhost:5001
5. Redis: localhost:6379
6. Postgres: localhost:5432

## 4. Manual validation pipeline

### 4.1 Tool precheck

```bash
node -v
npm -v
docker --version
docker compose version
```

### 4.2 Per-service tests (optional but recommended before demo)

```bash
cd services/optimizer && npm test -- --runInBand
cd ../realtime && npm test -- --runInBand
cd ../gateway && npm test -- --runInBand
cd ../automation && npm test -- --runInBand
cd ../..
```

### 4.3 Start complete stack

```bash
docker compose down --remove-orphans
docker compose up -d --build
docker compose ps
```

## 5. Backend demo smoke tests

### 5.1 Health checks

```bash
curl -sS -i http://localhost:3002/api/v1/health
curl -sS -i http://localhost:5001/health
```

Expected:

1. Gateway responds 200 with status ok.
2. AI Predictor responds 200 with status ok.

### 5.2 Login in Gateway

```bash
curl -sS -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}'
```

Expected:

1. accessToken.
2. refreshToken.
3. tokenType Bearer.

### 5.3 Authenticated end-to-end webhook

```bash
TOKEN=$(curl -sS -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' \
  | node -pe "const fs=require('fs');JSON.parse(fs.readFileSync(0,'utf8')).accessToken")

curl -sS -X POST http://localhost:3002/api/v1/webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: demo-backend-001' \
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
    "jobs":[
      {
        "id":"j-001",
        "location":{"lat":4.7005,"lon":-74.0502},
        "service":120,
        "amount":1
      }
    ]
  }'
```

Expected response:

1. received true.
2. fallback false.
3. socketConnected true.
4. optimizedRoutes.code equal to 0.
5. routes[0].vehicleId equal to v-001.

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
docker logs --tail 120 logiflow-gateway
docker logs --tail 120 logiflow-optimizer
docker logs --tail 120 logiflow-realtime
```

Look for evidence of:

1. Gateway receives webhook with correlationId.
2. Gateway sends VRP to optimizer and receives routes code 0.
3. SocketClientService emits route-update.
4. Optimizer processes without timeout.

## 6. Optional demo with and without AI (backend only)

By default in compose, AI_PREDICTOR_ENABLED is set to false inside optimizer.

To compare two runs:

1. Change AI_PREDICTOR_ENABLED to true in docker-compose.yml.
2. Rebuild optimizer:

```bash
docker compose up -d --build optimizer
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
docker compose down --remove-orphans
```

If you want to preserve DB/Redis state for a second demo, skip down and leave the containers running.
