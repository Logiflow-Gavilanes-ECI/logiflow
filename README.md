# 🚦 LogiFlow — Backend Services

[![CI](https://img.shields.io/github/actions/workflow/status/Logiflow-Gavilanes-ECI/logiflow/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/Logiflow-Gavilanes-ECI/logiflow/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Logiflow-Gavilanes-ECI_logiflow&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Logiflow-Gavilanes-ECI_logiflow)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Logiflow-Gavilanes-ECI_logiflow&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Logiflow-Gavilanes-ECI_logiflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22](https://img.shields.io/badge/node-22-brightgreen?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![PostgreSQL 16](https://img.shields.io/badge/postgres-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis 7](https://img.shields.io/badge/redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)

```
  ██╗      ██████╗  ████���█╗ ██╗███████╗██╗      ██████╗ ██╗    ██╗
  ██║     ██╔═══██╗██╔════╝ ██║██╔════╝██║     ██╔═══██╗██║    ██║
  ██║     ██║   ██║██║  ███╗██║█████╗  ██║     ██║   ██║██║ █╗ ██║
  ██║     ██║   ██║██║   ██║██║██╔══╝  ██║     ██║   ██║██║███╗██║
  ███████╗╚██████╔╝╚██████╔╝██║██║     ███████╗╚██████╔╝╚███╔███╔╝
  ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
```

> **AI-powered real-time fleet routing — solving the Vehicle Routing Problem, one traffic jam at a time.**

---

## 🗺️ What is LogiFlow?

LogiFlow is a scalable, real-time fleet routing platform built for the Colombian logistics landscape. It continuously solves the **Vehicle Routing Problem (VRP)** across multiple vehicles and delivery points — optimizing routes on the fly whenever traffic, weather, or a new urgent order changes the picture.

Every reroute is calculated in **under 4 seconds** and pushed instantly to drivers via WebSockets. No polling. No stale routes. No missed windows.

---

## 🏗️ System Architecture

```mermaid
graph TD
    A["🔔 n8n Automation\nWebhook + Mock Server"] -->|webhook POST| B["⚙️ NestJS Gateway\nREST API + Prisma"]
    B -->|gRPC| C["🧮 Route Optimizer\nVROOM VRP Engine"]
    H["🤖 AI Traffic Predictor\nFlask + Corridor Model"] -->|adjusted matrix| C
    C -->|optimized routes| B
    B -->|Socket.io client| D["📡 Realtime Server\nSocket.io + Redis"]
    D -->|WebSocket push| E["📱 Driver Mobile App\nIonic Angular"]
    D -->|WebSocket push| F["🖥️ Admin Dashboard\nAngular Web App"]
    G[("🐘 PostgreSQL 16\nVehicles · Stops · Auth")] --- B
    I[("⚡ Redis 7\nSocket Adapter + Cache")] --- D
    I --- C

    style A fill:#ff6b35,color:#fff,stroke:#ff6b35
    style B fill:#00e5ff,color:#000,stroke:#00e5ff
    style C fill:#229ED9,color:#fff,stroke:#229ED9
    style D fill:#7c3aed,color:#fff,stroke:#7c3aed
    style E fill:#22c55e,color:#fff,stroke:#22c55e
    style F fill:#22c55e,color:#fff,stroke:#22c55e
    style G fill:#336791,color:#fff,stroke:#336791
    style H fill:#a78bfa,color:#fff,stroke:#a78bfa
    style I fill:#DC382D,color:#fff,stroke:#DC382D
```

### Data Flow

```mermaid
sequenceDiagram
    participant A as n8n Automation
    participant GW as Gateway (NestJS)
    participant OPT as Optimizer (gRPC)
    participant AI as AI Predictor
    participant RT as Realtime (Socket.io)
    participant APP as Mobile / Web

    A->>GW: POST /api/v1/webhook/optimize
    GW->>OPT: gRPC OptimizeRoutes()
    OPT->>AI: POST /adjust (duration matrix)
    AI-->>OPT: AI-adjusted durations
    OPT-->>GW: Optimized routes
    GW->>RT: POST /emit/route-update
    RT-->>APP: WebSocket "route:update"
```

---

## 📦 Monorepo Structure

```
logiflow/
├── services/
│   ├── gateway/            ← NestJS REST API, Prisma ORM, JWT Auth, gRPC Client
│   ├── optimizer/          ← gRPC Server + VROOM VRP Engine + Google Routes
│   ├── realtime/           ← Socket.io Server + Redis Adapter
│   ├── automation/         ← n8n Webhook Mock Server + Message Builder
│   └── ai-predictor/       ← Python Flask Traffic Prediction Service
├── shared/
│   └── proto/
│       └── optimizer.proto ← gRPC contract (single source of truth)
├── docker-compose.yml      ← Full system orchestration (7 containers)
└── .github/
    └── workflows/          ← CI/CD pipelines + SonarCloud
```

---

## 🧩 Service Details

| Service | Tech Stack | Port | Purpose |
|---------|-----------|------|---------|
| **Gateway** | NestJS · TypeScript · Prisma · PostgreSQL | `3002` | REST API, auth (JWT + refresh tokens), vehicle/stop CRUD, gRPC client |
| **Optimizer** | Node.js · gRPC · VROOM · Axios | `50051` | VRP solver, Google Routes integration, Redis caching |
| **Realtime** | Socket.io · Redis Adapter · Express | `3001` | WebSocket rooms, position broadcast, heartbeat monitoring |
| **Automation** | Express · n8n Webhooks | `5678` | Event triggers, mock server for testing |
| **AI-Predictor** | Python · Flask | `5001` | Traffic corridor model, peak-hour duration adjustments |
| **PostgreSQL** | PostgreSQL 16 Alpine | `5432` | Persistent storage for vehicles, stops, users, tokens |
| **Redis** | Redis 7 Alpine | `6379` | Socket.io adapter, route cache, pub/sub |

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| [Docker + Docker Compose](https://docs.docker.com/compose/) | 24+ |
| [Node.js](https://nodejs.org/) | 22+ |
| [Python](https://www.python.org/) | 3.12+ (for AI service only) |

### Run the full system

```bash
git clone https://github.com/Logiflow-Gavilanes-ECI/logiflow.git
cd logiflow
docker compose up -d
```

All 7 containers start and wire up automatically. Wait ~60 seconds for the gateway to compile and run migrations.

### Verify services

```bash
# Check all containers are running
docker compose ps

# Test Gateway API
curl http://localhost:3002/api/v1/vehicles

# Test AI Predictor health
curl http://localhost:5001/health

# Check Gateway logs
docker logs logiflow-gateway --tail 20
```

### Run a single service

```bash
cd services/optimizer
docker compose up
```

See each service's own `README.md` for environment variables and test instructions.

---

## 🔌 API Endpoints

### Gateway REST API (`localhost:3002/api/v1`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | ❌ | Login with credentials |
| `POST` | `/auth/register` | ❌ | Register new user |
| `POST` | `/auth/refresh` | ❌ | Refresh access token |
| `GET` | `/vehicles` | ✅ | List all vehicles |
| `POST` | `/vehicles` | ✅ | Create vehicle |
| `GET` | `/vehicles/:id` | ✅ | Get vehicle by ID |
| `PUT` | `/vehicles/:id` | ✅ | Update vehicle |
| `DELETE` | `/vehicles/:id` | ✅ | Delete vehicle |
| `GET` | `/stops` | ✅ | List all stops |
| `POST` | `/stops` | ✅ | Create stop |
| `DELETE` | `/stops/:id` | ✅ | Delete stop |
| `POST` | `/webhook/optimize` | ✅ | Trigger route optimization |

### gRPC Contract

```protobuf
service RouteOptimizer {
  rpc OptimizeRoutes (OptimizeRequest) returns (OptimizeResponse);
}
```

### Socket.io Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `vehicle:position` | Client → Server | `{ vehicleId, lat, lng, speed }` |
| `route:update` | Server → Client | `{ vehicleId, stops, polyline, estimatedTime }` |
| `vehicle:offline` | Server → Client | `{ vehicleId }` |
| `vehicle:online` | Server → Client | `{ vehicleId }` |

---

## 🔐 Authentication

JWT-based auth with refresh token rotation:

1. **Login** → returns `accessToken` + `refreshToken`
2. **Access token** expires in 1 hour (configurable via `JWT_EXPIRES_IN`)
3. **Refresh token** stored hashed in PostgreSQL, 7-day TTL
4. **Token rotation** — each refresh consumes the old token and issues a new pair
5. **Password hashing** — scrypt with random 16-byte salt for registered users

---

## 🌿 Git Workflow

```
main          ← stable, demo-ready. Protected.
└── develop   ← sprint integration target. Protected.
    ├── feat/optimizer-grpc
    ├── feat/nestjs-core
    ├── feat/socket-gateway
    └── feat/n8n-ci
```

**Commit convention** — [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat(optimizer): add gRPC server with VROOM proxy
fix(gateway): correct proto import path
chore: add root docker-compose integration file
```

---

## 🧪 Testing

Each service runs its own test suite:

```bash
cd services/gateway
npm test              # Jest + coverage
npm run test:watch    # watch mode
npm run lint          # ESLint
```

CI runs on every push to `main`, `develop`, and `feat/**`:

```mermaid
graph LR
    A[Push] --> B[Checkout]
    B --> C[Node 22 Setup]
    C --> D[npm ci]
    D --> E[ESLint]
    E --> F[Jest + Coverage]
    F --> G[SonarCloud Analysis]

    style A fill:#ff6b35,color:#fff
    style G fill:#00e5ff,color:#000
```

---

## ⚙️ Environment Variables

### Gateway

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | HTTP listen port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | JWT signing secret (required) |
| `JWT_EXPIRES_IN` | `1h` | Access token TTL |
| `GRPC_OPTIMIZER_HOST` | `optimizer` | Optimizer service hostname |
| `GRPC_OPTIMIZER_PORT` | `50051` | Optimizer gRPC port |
| `SOCKETIO_SERVER_HOST` | `realtime` | Realtime service hostname |
| `SOCKETIO_SERVER_PORT` | `3001` | Realtime service port |

### Optimizer

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | `50051` | gRPC listen port |
| `VROOM_URL` | `http://vroom:3000` | VROOM engine URL |
| `REDIS_URL` | `redis://redis:6379` | Redis connection |
| `AI_PREDICTOR_URL` | `http://ai-predictor:5001/adjust` | AI service endpoint |

### Realtime

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP/WS listen port |
| `REDIS_URL` | `redis://redis:6379` | Redis connection for adapter |

---

## 👥 Team

| Name | Handle | Service Ownership |
|------|--------|-------------------|
| **Andersson David Sánchez Méndez** | @AnderssonProgramming | `automation` — n8n + CI |
| **Cristian Santiago Pedraza Rodríguez** | @cris-eci | `optimizer` — gRPC + VROOM |
| **Elizabeth Correa Suárez** | @Eliza-05 | `realtime` — Socket.io + Redis |
| **Juan Sebastian Ortega Muñoz** | @Juanseom | `gateway` — NestJS + Prisma |

---

## 📄 License

MIT © 2026 LogiFlow — Escuela Colombiana de Ingeniería Julio Garavito
