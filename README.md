<div align="center">

# LogiFlow — Backend Monorepo

**AI-powered real-time dynamic fleet routing platform**

[![CI](https://github.com/Logiflow-Gavilanes-ECI/logiflow/actions/workflows/ci.yml/badge.svg)](https://github.com/Logiflow-Gavilanes-ECI/logiflow/actions/workflows/ci.yml)
[![Deploy](https://github.com/Logiflow-Gavilanes-ECI/logiflow/actions/workflows/deploy-backend.yml/badge.svg)](https://github.com/Logiflow-Gavilanes-ECI/logiflow/actions/workflows/deploy-backend.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22-brightgreen?logo=nodedotjs)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[**Live API**](https://logiflow-api.eastus2.cloudapp.azure.com/api/v1/health) · [**API Docs**](https://logiflow-api.eastus2.cloudapp.azure.com/api/v1/docs) · [**Web Admin**](https://logiflowapp.z13.web.core.windows.net)

</div>

---

## Overview

LogiFlow is a microservices platform that receives real-time traffic events (via n8n webhooks), computes optimal delivery routes (VROOM + AI travel-time predictor), and pushes updates to drivers and dispatchers in real time (Socket.io + Firebase Cloud Messaging).

```
Traffic Event (n8n webhook)
        │
        ▼
  ┌─────────────┐   gRPC    ┌─────────────────┐   HTTP   ┌───────────────┐
  │   Gateway   │ ────────► │    Optimizer     │ ───────► │     VROOM     │
  │  (NestJS)   │           │  (Node + gRPC)   │          │  (VRP engine) │
  └──────┬──────┘           └────────┬─────────┘          └───────────────┘
         │                           │ HTTP
         │ Socket.io              ┌──┴─────────────┐
         │                        │  AI Predictor  │
         ▼                        │  (Python/Flask)│
  ┌─────────────┐                 └────────────────┘
  │   Realtime  │   Redis
  │ (Socket.io) │ ◄──────► Redis (pub/sub + route cache)
  └─────────────┘
         │
         ├─── fleet room  → Web Admin dashboard
         └─── vehicle:*   → Driver mobile app
```

---

## Table of Contents

- [Services](#services)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [CI/CD](#cicd)
- [Infrastructure](#infrastructure)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Documentation](#documentation)
- [Team](#team)

---

## Documentation

Architecture deliverables for the Release 2 final submission live under [`docs/`](docs/):

| Document | File | Description |
|---|---|---|
| **Slides** | [`docs/LogiFlow-presentation.pptx`](docs/LogiFlow-presentation.pptx) | 18-slide presentation deck (Spanish) covering problem, architecture, quality attributes, demo, Scrum recap |
| **Architecture document** | [`docs/LogiFlow-architecture.tex`](docs/LogiFlow-architecture.tex) | Full LaTeX architecture document (Spanish) — methodology, quality attributes, UML diagrams, sprint logbook |
| **Backend demo runbook** | [`docs/backend-demo-runbook.md`](docs/backend-demo-runbook.md) | Step-by-step VM demo guide for stakeholder presentations |
| **UML diagrams (sources)** | [`docs/diagrams/`](docs/diagrams/) | Eraser AI prompts and exported PNG/SVG diagrams |

---

## Services

| Service | Tech | Port | Description |
|---|---|---|---|
| **gateway** | NestJS 11, Prisma 7, PostgreSQL | `3002` | REST API, Google OAuth, JWT, webhooks, FCM |
| **realtime** | Node.js, Socket.io 4, Redis Adapter | `3001` | WebSocket server for live fleet tracking |
| **optimizer** | Node.js, gRPC, VROOM, Redis | `50051` | VRP route optimization over gRPC |
| **ai-predictor** | Python 3.12, Flask 3.1, gunicorn | `5001` | Traffic-aware travel time adjustments |
| **vroom** | C++ VRP engine | `3000` | Internal only — called by optimizer |
| **postgres** | PostgreSQL 16 | `5432` | Primary database (users, vehicles, stops, routes) |
| **redis** | Redis 7 | `6379` | Pub/sub, Socket.io adapter, route cache |
| **n8n** *(automation profile)* | n8n 1.66.0 | `5678` | Workflow automation — ingest traffic events |
| **openclaw** *(automation profile)* | OpenClaw 2026.5.12, Claude Sonnet 4 | `18789` | AI-powered multi-channel notifications |

### gateway

NestJS REST API — the single public entry point for all clients.

**Key responsibilities:**
- Google OAuth 2.0 — sole authentication method (no email/password in production)
- JWT access tokens (1h) + rotated refresh tokens (7-day default TTL, stored hashed)
- Role-based access: `admin` (dispatchers) and `conductor` (drivers)
- Receives traffic webhooks, calls the optimizer over gRPC, broadcasts results via Socket.io, sends FCM push notifications
- Vehicle and stop CRUD (admin only)

**Notable endpoints:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Health check |
| `GET` | `/api/v1/auth/google` | Public | Initiate Google OAuth (`?app=admin\|mobile\|web`) |
| `GET` | `/api/v1/auth/google/callback` | Public | OAuth redirect handler |
| `POST` | `/api/v1/auth/google/token` | Public | Exchange Google ID token (mobile) |
| `POST` | `/api/v1/auth/refresh` | Public | Rotate refresh token |
| `POST` | `/api/v1/webhook` | JWT (admin) | Receive traffic event, trigger optimization |
| `GET/POST/PATCH/DELETE` | `/api/v1/vehicles` | JWT | Fleet management |
| `GET/POST/PATCH/DELETE` | `/api/v1/stops` | JWT | Stop management |
| `POST` | `/api/v1/notifications/register-device` | JWT (conductor) | Register FCM device token |
| `GET` | `/api/v1/docs` | Public | Swagger UI |

**Tech stack:** NestJS 11 · Prisma 7 · `@grpc/grpc-js` · `passport-google-oauth20` · `passport-jwt` · `firebase-admin` · `socket.io-client` · bcrypt · Swagger

### optimizer

gRPC server that takes a Vehicle Routing Problem (VRP) payload, optionally adjusts travel times with the AI Predictor, calls VROOM, and persists route summaries to Redis.

**Environment flags:**

| Variable | Dev default | Description |
|---|---|---|
| `MATRIX_SOURCE` | `request` | `request` = use matrix from payload; `google` = call Google Routes API |
| `GOOGLE_ROUTES_ALLOW_CALLS` | `false` | Gate for live Google Routes API calls |
| `GOOGLE_ROUTES_MOCK` | `true` | Return mock matrix instead of real API |
| `AI_PREDICTOR_ENABLED` | `false` | Toggle AI travel-time adjustments |
| `REDIS_ROUTE_TTL_SECONDS` | `3600` | Route cache TTL in Redis |

**Metrics (Prometheus on port `9090` in prod):**
`optimize_requests_total` · `optimize_duration_ms` · `vroom_failures_total` · `ai_predictor_failures_total` · `ai_breaker_state_changes` · `redis_failures_total` · `matrix_source_total`

**AI circuit breaker (opossum):** 50% error threshold · 30s reset · min 5 volume.

### realtime

Socket.io server with Redis pub/sub adapter for multi-instance support.

**Rooms:**

| Room | Clients | Events received |
|---|---|---|
| `fleet` | Web admin dashboard | All fleet events |
| `vehicle:<id>` | Driver mobile app | `route:update` for that vehicle |

**Events emitted:**

| Event | Payload | Direction |
|---|---|---|
| `vehicle:position` | `{ vehicleId, lat, lng, speed }` | Realtime → clients |
| `route:update` | `{ vehicleId, stops[], polyline[], estimatedTime, totalDistance, eventType }` | Gateway → realtime → clients |
| `vehicle:offline` | `{ vehicleId }` | Realtime → clients |
| `vehicle:online` | `{ vehicleId }` | Realtime → clients |
| `vehicle:status` | `{ vehicleId, status }` | Driver → realtime → fleet room |

### ai-predictor

Flask service that applies traffic multipliers to a duration matrix based on time-of-day and road corridor.

**Modeled corridors (Bogotá):**

| Corridor | Peak hours | Multiplier |
|---|---|---|
| `autopista_norte` | 07–09, 17–19 | 1.8× |
| `calle_80` | 07–09 | 1.6× |
| `carrera_7` | 12–14, 17–19 | 1.5× |

Weekends: no adjustment (1.0×). Skips silently when `AI_PREDICTOR_ENABLED=false`.

### n8n + OpenClaw *(automation profile)*

**n8n** auto-imports and activates workflow `logiflow-traffic-event-trigger` on startup. The workflow accepts a public webhook at `POST /webhook/logiflow/traffic-event`, authenticates with the gateway, and forwards the normalized payload to `POST /api/v1/webhook`.

**OpenClaw** runs a `logiflow-notify` skill that dispatches AI-generated alerts (Claude Sonnet 4) across 5 channels simultaneously:

| Channel | Required env var(s) |
|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Discord | `DISCORD_WEBHOOK_URL` |
| Slack | `SLACK_WEBHOOK_URL` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_TO` |
| Firebase Push | `LOGIFLOW_GATEWAY_URL`, `LOGIFLOW_GATEWAY_TOKEN` |

Each channel skips silently when its env var is not set.

---

## Quick Start

### Prerequisites

- Docker 24+ and Docker Compose v2
- Ports free: `3000`, `3001`, `3002`, `5001`, `5432`, `6379`, `50051`

### 1. Clone and configure

```bash
git clone https://github.com/Logiflow-Gavilanes-ECI/logiflow.git
cd logiflow
cp .env.example .env
# Edit .env — Google OAuth, Firebase, and Google Maps keys are optional for local dev
```

### 2. Start the base stack

```bash
docker compose up -d --build
docker compose ps
```

The gateway runs Prisma migrations and seeds the database on first boot.

**Seed credentials (dev only):**

| Email | Password | Role | Vehicle |
|---|---|---|---|
| `admin@logiflow.app` | `Admin2026!` | `admin` | — |
| `conductor@logiflow.app` | `Driver2026!` | `conductor` | `v-001` |
| `conductor2@logiflow.app` | `Driver2026!` | `conductor` | `v-002` |

### 3. Optional — start automation profile

```bash
docker compose --profile automation up -d
```

Adds n8n (`:5678`) and OpenClaw (`:18789`) to the running stack.

### 4. Verify

```bash
curl http://localhost:3002/api/v1/health
# → {"status":"ok"}
```

Full API docs: [http://localhost:3002/api/v1/docs](http://localhost:3002/api/v1/docs)

---

## Environment Variables

### Gateway (`services/gateway`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3002` | HTTP port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `1h` | Access token TTL |
| `REFRESH_TOKEN_TTL_MINUTES` | No | `10080` | Refresh token TTL (7 days) |
| `GRPC_OPTIMIZER_HOST` | Yes | — | Optimizer hostname |
| `GRPC_OPTIMIZER_PORT` | No | `50051` | Optimizer gRPC port |
| `SOCKETIO_SERVER_HOST` | Yes | — | Realtime hostname |
| `SOCKETIO_SERVER_PORT` | No | `3001` | Realtime port |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `GOOGLE_CLIENT_ID` | No* | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No* | — | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | No | `http://localhost:3002/api/v1/auth/google/callback` | OAuth redirect URI |
| `GOOGLE_REDIRECT_FRONTEND` | No | `http://localhost:4200` | Web app redirect after OAuth |
| `GOOGLE_REDIRECT_FRONTEND_ADMIN` | No | — | Admin app redirect after OAuth |
| `GOOGLE_REDIRECT_FRONTEND_MOBILE` | No | `http://localhost:8100` | Mobile app redirect after OAuth |
| `GOOGLE_ADMIN_EMAILS` | No | — | Comma-separated emails auto-assigned `admin` role |
| `FIREBASE_PROJECT_ID` | No* | — | Firebase project ID (FCM push) |
| `FIREBASE_CLIENT_EMAIL` | No* | — | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | No* | — | Firebase private key (newlines as `\n`) |

*Required only when the relevant feature is used. The gateway starts normally without them — Google OAuth returns 501 if not configured; FCM push is skipped silently.

### Optimizer (`services/optimizer`)

| Variable | Default | Description |
|---|---|---|
| `GRPC_PORT` | `50051` | gRPC listen port |
| `VROOM_URL` | — | VROOM HTTP endpoint |
| `REDIS_URL` | — | Redis connection URL |
| `MATRIX_SOURCE` | `request` | `request` or `google` |
| `GOOGLE_ROUTES_ENABLED` | `false` | Enable Google Routes integration |
| `GOOGLE_ROUTES_ALLOW_CALLS` | `false` | Allow live API calls |
| `GOOGLE_ROUTES_MOCK` | `true` | Use mock matrix response |
| `AI_PREDICTOR_ENABLED` | `false` | Enable AI travel-time adjustment |
| `AI_PREDICTOR_URL` | — | AI Predictor endpoint |
| `AI_PREDICTOR_TIMEOUT_MS` | `3000` | Per-request timeout |
| `AI_BREAKER_ERROR_PCT` | `50` | Circuit breaker error % threshold |
| `AI_BREAKER_RESET_MS` | `30000` | Circuit breaker reset timeout |
| `AI_BREAKER_VOLUME` | `5` | Minimum call volume for breaker |
| `REDIS_ROUTE_TTL_SECONDS` | `3600` | Route cache TTL |
| `METRICS_PORT` | — | Prometheus metrics port (prod: `9090`) |
| `SHUTDOWN_DEADLINE_MS` | `25000` | Graceful shutdown deadline |

### Automation (n8n / OpenClaw)

| Variable | Description |
|---|---|
| `WEBHOOK_TARGET` | Gateway webhook URL |
| `GATEWAY_AUTH_EMAIL` | Gateway admin login email |
| `GATEWAY_AUTH_PASSWORD` | Gateway admin login password |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key for route display |
| `ANTHROPIC_API_KEY` | Anthropic API key (OpenClaw AI) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Telegram target chat ID |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email SMTP config |
| `SMTP_FROM` | Sender address (`LogiFlow Alerts <alerts@logiflow.app>`) |
| `SMTP_TO` | Recipient address |
| `OPENCLAW_WEBHOOK_URL` | OpenClaw skill endpoint |

---

## CI/CD

### Continuous Integration

GitHub Actions runs on every push and pull request to `main` and `develop`.

The pipeline runs four parallel service jobs:

```
[automation] [gateway] [realtime] [optimizer]
      └── npm ci
      └── prisma generate   (gateway only)
      └── npm run lint
      └── npm test --coverage
      └── SonarQube scan    (if sonar-project.properties present)
```

### Continuous Deployment

On every merge to `main` (after CI passes):

```
Checkout → rsync to Azure VM → docker compose up -d --build → smoke test
```

- **Target:** Azure VM at `logiflow-api.eastus2.cloudapp.azure.com`
- **Smoke test:** polls `GET /api/v1/health` up to 8 times (15s intervals)
- **Required secrets:** `SSH_PRIVATE_KEY`, `SERVER_IP`, `SSH_USER`

---

## Infrastructure

The production environment runs on an **Azure Virtual Machine** behind **Nginx** with **Let's Encrypt TLS**.

```
Internet
   │ HTTPS
   ▼
 Nginx (TLS termination)
   ├── /api/*           → gateway:3002
   ├── /socket.io/*     → realtime:3001
   └── /webhook/*       → n8n:5678
```

- **IaC:** Terraform (`infra/terraform/`) — provisions VM, DNS, and generates `docker-compose.prod.yml` and `nginx.conf` from templates
- **Frontend static site:** Azure Blob Storage static website (`$web` container)
- **Deploy script:** `infra/scripts/deploy.sh`
- **Prod FQDN:** `logiflow-api.eastus2.cloudapp.azure.com`

**Prod-only differences vs dev:**
- Redis requires password auth (`--requirepass`)
- Resource limits (CPU/memory) on all containers
- JSON-file log rotation
- Prometheus metrics endpoint on optimizer (`:9090`)
- `AI_PREDICTOR_ENABLED=true`, `GOOGLE_ROUTES_ALLOW_CALLS=true`

---

## API Reference

Full Swagger UI available at:
- **Local:** [http://localhost:3002/api/v1/docs](http://localhost:3002/api/v1/docs)
- **Production:** [https://logiflow-api.eastus2.cloudapp.azure.com/api/v1/docs](https://logiflow-api.eastus2.cloudapp.azure.com/api/v1/docs)

### gRPC Contract

The optimizer exposes a single RPC defined in [`shared/proto/optimizer.proto`](shared/proto/optimizer.proto):

```protobuf
service RouteOptimizer {
  rpc OptimizeRoutes(OptimizeRequest) returns (OptimizeResponse);
}
```

Key message fields:

| Message | Fields |
|---|---|
| `OptimizeRequest` | `vehicles[]`, `jobs[]`, `shipments[]`, `matrix`, `options`, `departureTime`, `correlationId` |
| `OptimizeResponse` | `routes[]`, `code`, `summary`, `matrixSource`, `aiAdjusted`, `correlationId` |
| `Vehicle` | `id` (string, e.g. `v-001`), `startCoord`, `capacity`, `profile` |
| `Job` | `id`, `location`, `service`, `amount[]`, `priority`, `timeWindows[]` |

---

## Testing

```bash
# Run all tests for a service
cd services/gateway && npm test
cd services/optimizer && npm test
cd services/realtime && npm test
cd services/automation && npm test

# With coverage
npm test -- --coverage

# Gateway only — run in band (DB tests)
npm test -- --runInBand
```

**Current status:** 13 test suites · 70 tests passing

Test files are co-located with source (`*.spec.ts`). The gateway uses a full Prisma mock (`__mocks__/prisma-client.mock.ts`) — no real DB required for unit tests.

---

## Project Structure

```
logiflow/
├── .github/workflows/       CI + deploy pipelines
├── docs/                    Runbooks and guides
├── infra/
│   ├── nginx/               Nginx config template
│   ├── scripts/             Deploy script
│   └── terraform/           IaC (VM, DNS, TLS, compose generation)
├── services/
│   ├── ai-predictor/        Python Flask traffic predictor
│   ├── automation/
│   │   ├── n8n/             Workflow JSON + entrypoint
│   │   └── openclaw/        AI notification skill
│   ├── gateway/             NestJS REST API
│   ├── optimizer/           gRPC + VROOM wrapper
│   └── realtime/            Socket.io server
├── shared/
│   └── proto/               optimizer.proto (gRPC contract)
├── docker-compose.yml       Dev stack
├── docker-compose.prod.yml  Production stack
└── .env.example             All variables documented
```

---

## Team

**Los Gavilanes del Codigo — ARSW, Escuela Colombiana de Ingenieria Julio Garavito**

| Name | Handle | Service Ownership |
|------|--------|-------------------|
| **Andersson David Sanchez Mendez** | [@AnderssonProgramming](https://github.com/AnderssonProgramming) | `automation` — n8n, OpenClaw, CI/CD |
| **Cristian Santiago Pedraza Rodriguez** | [@cris-eci](https://github.com/cris-eci) | `optimizer` — gRPC, VROOM, AI predictor |
| **Elizabeth Correa Suarez** | [@Eliza-05](https://github.com/Eliza-05) | `realtime` — Socket.io, Redis |
| **Juan Sebastian Ortega Munoz** | [@Juanseom](https://github.com/Juanseom) | `gateway` — NestJS, Prisma, Auth |

---

## License

MIT © 2026 LogiFlow — Escuela Colombiana de Ingenieria Julio Garavito
