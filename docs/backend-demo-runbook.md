# Demo Backend Manual - LogiFlow

Este documento permite ejecutar una demo funcional de LogiFlow solo con backend (sin frontend).

## 1. Objetivo de la demo

Validar en vivo el flujo completo backend:

1. Autenticacion en Gateway.
2. Recepcion de webhook autenticado.
3. Optimizacion de rutas via Optimizer + VROOM.
4. Emision de evento realtime.
5. Persistencia de ruta por vehiculo en Redis con clave canonica.

## 2. Prerrequisitos

1. Docker y Docker Compose instalados.
2. Node 20+ y npm (para prechecks locales).
3. Puerto libres: 3000, 3001, 3002, 5001, 50051, 5432, 6379.

## 3. Estado esperado de servicios

Al levantar compose, deben quedar disponibles:

1. Gateway: http://localhost:3002
2. Realtime: http://localhost:3001
3. VROOM: http://localhost:3000
4. AI Predictor: http://localhost:5001
5. Redis: localhost:6379
6. Postgres: localhost:5432

## 4. Pipeline manual de validacion

### 4.1 Precheck de herramientas

```bash
node -v
npm -v
docker --version
docker compose version
```

### 4.2 Tests por servicio (opcional pero recomendado antes de demo)

```bash
cd services/optimizer && npm test -- --runInBand
cd ../realtime && npm test -- --runInBand
cd ../gateway && npm test -- --runInBand
cd ../automation && npm test -- --runInBand
cd ../..
```

### 4.3 Levantar stack completo

```bash
docker compose down --remove-orphans
docker compose up -d --build
docker compose ps
```

## 5. Smoke tests de demo backend

### 5.1 Health checks

```bash
curl -sS -i http://localhost:3002/api/v1/health
curl -sS -i http://localhost:5001/health
```

Esperado:

1. Gateway responde 200 con status ok.
2. AI Predictor responde 200 con status ok.

### 5.2 Login en Gateway

```bash
curl -sS -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}'
```

Esperado:

1. accessToken.
2. refreshToken.
3. tokenType Bearer.

### 5.3 Webhook autenticado end-to-end

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

Esperado en respuesta:

1. received true.
2. fallback false.
3. socketConnected true.
4. optimizedRoutes.code igual a 0.
5. routes[0].vehicleId igual a v-001.

### 5.4 Verificacion de Redis

```bash
docker exec logiflow-redis redis-cli --raw KEYS 'route:vehicle:*'
docker exec logiflow-redis redis-cli --raw GET route:vehicle:v-001
```

Esperado:

1. Existe la clave route:vehicle:v-001.
2. El payload incluye vehicleId v-001.

### 5.5 Verificacion de logs (evidencia para stakeholders)

```bash
docker logs --tail 120 logiflow-gateway
docker logs --tail 120 logiflow-optimizer
docker logs --tail 120 logiflow-realtime
```

Buscar evidencia de:

1. Gateway recibe webhook con correlationId.
2. Gateway envia VRP al optimizer y recibe rutas code 0.
3. SocketClientService emite route-update.
4. Optimizer procesa sin timeout.

## 6. Demo opcional con y sin AI (solo backend)

Por defecto en compose esta AI_PREDICTOR_ENABLED en false dentro de optimizer.

Para comparar dos corridas:

1. Cambiar AI_PREDICTOR_ENABLED a true en docker-compose.yml.
2. Rebuild de optimizer:

```bash
docker compose up -d --build optimizer
```

3. Ejecutar el mismo webhook dos veces (AI true y AI false) y comparar matrixSource en respuesta/logs.

## 7. Problemas comunes y solucion

### 7.1 npm install falla con EACCES en realtime

Si services/realtime/node_modules quedo con owner root por ejecucion en contenedor:

```bash
docker run --rm -v "$PWD":/workspace alpine sh -c "chown -R $(id -u):$(id -g) /workspace/services/realtime/node_modules"
```

### 7.2 Socket no conecta (Unauthorized)

1. Verificar que realtime tenga JWT_SECRET en compose.
2. Verificar que gateway use el mismo JWT_SECRET.

### 7.3 Optimizer no escribe en Redis

1. Confirmar REDIS_URL en optimizer.
2. Revisar logs de optimizer por errores de persistencia.

## 8. Comandos de cierre

```bash
docker compose down --remove-orphans
```

Si quieres conservar estado de DB/Redis para segunda demo, omite down y deja los contenedores corriendo.
