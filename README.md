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
  ██╗      ██████╗  ██████╗ ██╗███████╗██╗      ██████╗ ██╗    ██╗
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

Every reroute is calculated in **under 4 seconds** and pushed instantly to drivers via WebSockets + Firebase Push Notifications. No polling. No stale routes. No missed windows.

---

## 🏗️ System Architecture

```mermaid
graph TD
    A["🔔 n8n Automation\nWebhook + OpenClaw"] -->|webhook POST| B["⚙️ NestJS Gateway\nREST + Prisma + Auth"]
    B -->|gRPC| C["🧮 Route Optimizer\nVROOM VRP Engine"]
    H["🤖 AI Traffic Predictor\nFlask + Corridor Model"] -->|adjusted matrix| C
    C -->|optimized routes| B
    B -->|Socket.io client| D["📡 Realtime Server\nSocket.io + Redis"]
    B -->|FCM push| J["🔥 Firebase Cloud Messaging"]
    D -->|WebSocket push| E["📱 Driver Mobile App\nIonic Angular"]
    D -->|WebSocket push| F["🖥️ Admin Dashboard\nAngular Web App"]
    J -->|push notification| E
    G[("🐘 PostgreSQL 16\nUsers · Vehicles · Stops\nDeviceTokens · Auth")] --- B
    I[("⚡ Redis 7\nSocket Adapter + Cache")] --- D
    I --- C
    K["🔐 Google OAuth 2.0\nIdentity Provider"] -->|SSO| B

    style A fill:#ff6b35,color:#fff,stroke:#ff6b35
    style B fill:#00e5ff,color:#000,stroke:#00e5ff
    style C fill:#229ED9,color:#fff,stroke:#229ED9
    style D fill:#7c3aed,color:#fff,stroke:#7c3aed
    style E fill:#22c55e,color:#fff,stroke:#22c55e
    style F fill:#22c55e,color:#fff,stroke:#22c55e
    style G fill:#336791,color:#fff,stroke:#336791
    style H fill:#a78bfa,color:#fff,stroke:#a78bfa
    style I fill:#DC382D,color:#fff,stroke:#DC382D
    style J fill:#FFCA28,color:#000,stroke:#FFCA28
    style K fill:#4285F4,color:#fff,stroke:#4285F4
```

### Data Flow

```mermaid
sequenceDiagram
    participant N8N as n8n Automation
    participant GW as Gateway NestJS
    participant GRPC as Optimizer gRPC
    participant AI as AI Predictor
    participant RT as Realtime Socket.io
    participant FCM as Firebase Push
    participant APP as Mobile / Web

    N8N->>GW: POST /api/v1/webhook/optimize
    GW->>GRPC: gRPC OptimizeRoutes
    GRPC->>AI: POST /adjust (duration matrix)
    AI-->>GRPC: AI-adjusted durations
    GRPC-->>GW: Optimized routes
    GW->>RT: Socket.io emit route update
    GW->>FCM: Multicast push notification
    RT-->>APP: WebSocket route:update
    FCM-->>APP: Push notification
```

### Notification Flow (Multi-Channel via OpenClaw)

```mermaid
graph LR
    E["⚡ Event Trigger\nn8n / Webhook"] --> OC["🐾 OpenClaw\nSkill Engine"]
    OC --> TG["💬 Telegram Bot"]
    OC --> DC["🎮 Discord Webhook"]
    OC --> SL["📢 Slack Webhook"]
    OC --> EM["📧 Email SMTP"]
    OC --> FB["🔥 Firebase Push"]

    style E fill:#ff6b35,color:#fff,stroke:#ff6b35
    style OC fill:#00e5ff,color:#000,stroke:#00e5ff
    style TG fill:#229ED9,color:#fff,stroke:#229ED9
    style DC fill:#5865F2,color:#fff,stroke:#5865F2
    style SL fill:#4A154B,color:#fff,stroke:#4A154B
    style EM fill:#22c55e,color:#fff,stroke:#22c55e
    style FB fill:#FFCA28,color:#000,stroke:#FFCA28
```

---

## 📦 Monorepo Structure

```
logiflow/
├── services/
│   ├── gateway/            ← NestJS REST API, Prisma ORM, JWT + Google OAuth, Firebase Push
│   ├── optimizer/          ← gRPC Server + VROOM VRP Engine + Google Routes
│   ├── realtime/           ← Socket.io Server + Redis Adapter
│   ├── automation/         ← n8n Webhook Mock Server + OpenClaw Multi-Channel Notifications
│   └── ai-predictor/       ← Python Flask Traffic Prediction Service
├── shared/
│   └── proto/
│       └── optimizer.proto ← gRPC contract (single source of truth)
├── infra/
│   ├── terraform/          ← Infrastructure as Code (DuckDNS + TLS + Nginx)
│   ├── nginx/              ← Reverse proxy configs
│   └── scripts/            ← Deployment scripts
├── docker-compose.yml      ← Full system orchestration (7 containers)
└── .github/
    └── workflows/          ← CI/CD pipelines + SonarCloud
```

---

## 🧩 Service Details

| Service | Tech Stack | Port | Purpose |
|---------|-----------|------|---------|
| **Gateway** | NestJS · TypeScript · Prisma · PostgreSQL | `3002` | REST API, JWT + Google OAuth, vehicle/stop CRUD, gRPC client, Firebase push |
| **Optimizer** | Node.js · gRPC · VROOM · Axios | `50051` | VRP solver, Google Routes integration, Redis caching |
| **Realtime** | Socket.io · Redis Adapter · Express | `3001` | WebSocket rooms, position broadcast, heartbeat monitoring |
| **Automation** | Express · n8n · OpenClaw | `5678` | Event triggers, multi-channel alerts (Telegram, Discord, Slack, Email, Firebase) |
| **AI-Predictor** | Python · Flask | `5001` | Traffic corridor model, peak-hour duration adjustments |
| **PostgreSQL** | PostgreSQL 16 Alpine | `5432` | Users, vehicles, stops, refresh tokens, device tokens |
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
| `POST` | `/auth/login` | ❌ | Login with email + password |
| `POST` | `/auth/register` | ❌ | Register new user (admin / conductor) |
| `POST` | `/auth/refresh` | ❌ | Refresh access token (rotation) |
| `GET` | `/auth/google` | ❌ | Initiate Google OAuth redirect |
| `GET` | `/auth/google/callback` | ❌ | Google OAuth callback (redirect with tokens) |
| `POST` | `/auth/google/token` | ❌ | Mobile: exchange Google ID token for JWT |
| `GET` | `/vehicles` | ✅ | List all vehicles |
| `POST` | `/vehicles` | ✅ | Create vehicle |
| `GET` | `/vehicles/:id` | ✅ | Get vehicle by ID |
| `PUT` | `/vehicles/:id` | ✅ | Update vehicle |
| `DELETE` | `/vehicles/:id` | ✅ | Delete vehicle |
| `GET` | `/stops` | ✅ | List all stops |
| `POST` | `/stops` | ✅ | Create stop |
| `PUT` | `/stops/:id` | ✅ | Update stop |
| `DELETE` | `/stops/:id` | ✅ | Delete stop |
| `POST` | `/webhook/optimize` | ✅ | Trigger route optimization |
| `POST` | `/notifications/register-device` | ✅ | Register FCM device token |

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

### JWT + Refresh Token Rotation

1. **Register** -> `POST /auth/register` creates demo users with `{ email, password, role }`
2. **Login** -> `POST /auth/login` returns `{ accessToken, role }`
3. **Access token** expires in 1 hour (configurable via `JWT_EXPIRES_IN`)
4. **Refresh token** stored hashed in PostgreSQL, 7-day TTL
5. **Token rotation** — each refresh consumes the old token and issues a new pair
6. **Password hashing** — bcrypt hashes for registered users

The gateway seed creates `admin@logiflow.app` / `Admin2026!`, `conductor@logiflow.app` / `Driver2026!`, and `conductor2@logiflow.app` / `Driver2026!`. The demo conductors use `id = v-001` and `id = v-002`, so their JWTs resolve to different vehicle IDs with distinct plates (`ABC-123` and `DEF-456`).

### Google OAuth 2.0 (Identity Provider)

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant GW as Gateway
    participant G as Google

    U->>FE: Click "Sign in with Google"
    FE->>GW: GET /auth/google
    GW->>G: Redirect to Google consent
    G-->>GW: Callback with auth code
    GW->>G: Exchange code for profile
    GW->>GW: Upsert user (googleId)
    GW-->>FE: Redirect /auth/callback?accessToken=...&role=...
    FE->>FE: Store token, redirect by role
```

The Google OAuth flow supports both **web redirect** (for web-admin and mobile browser) and **ID token exchange** (for native mobile via `POST /auth/google/token`).

For multi-frontend deployments, start login with `GET /auth/google?app=admin` to redirect the callback to `GOOGLE_REDIRECT_FRONTEND_ADMIN`. Without `app`, the gateway redirects to `GOOGLE_REDIRECT_FRONTEND`.

> **Graceful degradation:** If `GOOGLE_CLIENT_ID` is not set, the `/auth/google` endpoint returns a 501 with a helpful message. The gateway starts normally without Google credentials.
>
> **Default role:** Users created through Google OAuth are provisioned as `conductor` by default; emails in `GOOGLE_ADMIN_EMAILS` are promoted to `admin`.
>
> **Mobile token exchange note:** `POST /auth/google/token` verifies the incoming `idToken` against the configured `GOOGLE_CLIENT_ID` audience.

---

## 🔔 Push Notifications (Firebase Cloud Messaging)

The gateway sends **multicast push notifications** to driver mobile devices via Firebase Cloud Messaging (FCM):

- **Device registration** — Mobile app registers FCM token via `POST /notifications/register-device`
- **Route updates** — When a webhook triggers route optimization, push notifications are sent to affected drivers
- **Token cleanup** — Expired/invalid device tokens are automatically removed
- **Platform support** — Android (high priority channel), iOS (sound + badge), Web

> **Graceful degradation:** If Firebase credentials are not set, the service logs a warning and continues without push notifications.

---

## 🐾 Multi-Channel Notifications (OpenClaw)

The automation service uses [OpenClaw](https://openclaw.dev) for multi-channel alert dispatch. When a traffic event or risk alert fires, the `logiflow-notify` skill broadcasts to **all configured channels simultaneously**:

| Channel | Transport | Config Variable |
|---------|-----------|-----------------|
| 💬 **Telegram** | Bot API | `TELEGRAM_BOT_TOKEN` |
| 🎮 **Discord** | Webhook | `DISCORD_WEBHOOK_URL` |
| 📢 **Slack** | Webhook | `SLACK_WEBHOOK_URL` |
| 📧 **Email** | SMTP/Webhook | `EMAIL_WEBHOOK_URL` + `EMAIL_RECIPIENTS` |
| 🔥 **Firebase Push** | Gateway API | `GATEWAY_URL` + `GATEWAY_INTERNAL_KEY` |

Each channel degrades gracefully — unconfigured channels are silently skipped, and failures in one channel don't block the others.

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
| `JWT_SECRET` | — | JWT signing secret (**required**) |
| `JWT_EXPIRES_IN` | `1h` | Access token TTL |
| `GRPC_OPTIMIZER_HOST` | `optimizer` | Optimizer service hostname |
| `GRPC_OPTIMIZER_PORT` | `50051` | Optimizer gRPC port |
| `SOCKETIO_SERVER_HOST` | `realtime` | Realtime service hostname |
| `SOCKETIO_SERVER_PORT` | `3001` | Realtime service port |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret (optional) |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3002/api/v1/auth/google/callback` | OAuth callback URL |
| `GOOGLE_REDIRECT_FRONTEND` | `http://localhost:4200` | Frontend URL for OAuth redirect |
| `GOOGLE_REDIRECT_FRONTEND_ADMIN` | — | Optional admin frontend URL for OAuth redirect (`/auth/google?app=admin`) |
| `FIREBASE_PROJECT_ID` | — | Firebase project ID (optional) |
| `FIREBASE_CLIENT_EMAIL` | — | Firebase service account email (optional) |
| `FIREBASE_PRIVATE_KEY` | — | Firebase service account private key (optional) |

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

### Automation (OpenClaw Channels)

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | — | Telegram Bot API token |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook URL |
| `SLACK_WEBHOOK_URL` | — | Slack incoming webhook URL |
| `EMAIL_WEBHOOK_URL` | — | Email/SMTP relay endpoint |
| `EMAIL_RECIPIENTS` | — | Comma-separated recipient list |

---

## 🔑 Obtaining API Credentials

### Google OAuth (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Select **Web application** as the application type
6. Add authorized redirect URI: `http://localhost:3002/api/v1/auth/google/callback`
7. Copy the **Client ID** and **Client Secret**
8. Add to your `.env` file or docker-compose environment

### Firebase (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Navigate to **Project Settings → Service accounts**
4. Click **Generate new private key** — this downloads a JSON file
5. From the JSON file, extract:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (include the full `-----BEGIN PRIVATE KEY-----...` string)
6. Enable **Cloud Messaging API** in Google Cloud Console for the same project

### Discord Webhook (DISCORD_WEBHOOK_URL)

1. Open your Discord server → **Server Settings → Integrations → Webhooks**
2. Click **New Webhook**, name it "LogiFlow Alerts"
3. Select the channel for alerts and copy the **Webhook URL**

### Slack Webhook (SLACK_WEBHOOK_URL)

1. Go to [Slack API → Incoming Webhooks](https://api.slack.com/messaging/webhooks)
2. Create a new app or select existing → **Incoming Webhooks → Activate**
3. Click **Add New Webhook to Workspace** and select the channel
4. Copy the **Webhook URL**

### Telegram Bot (TELEGRAM_BOT_TOKEN)

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the **HTTP API token** provided

### Where to add credentials

Create a `.env` file at the project root:

```env
# Google OAuth (optional — gateway starts without these)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3002/api/v1/auth/google/callback
GOOGLE_REDIRECT_FRONTEND=http://localhost:4200
GOOGLE_REDIRECT_FRONTEND_ADMIN=http://localhost:4300

# Firebase Push Notifications (optional — gateway starts without these)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"

# OpenClaw Notification Channels (optional — each channel degrades independently)
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
EMAIL_WEBHOOK_URL=https://your-smtp-relay.com/send
EMAIL_RECIPIENTS=admin@company.com,ops@company.com
```

Docker Compose automatically reads `.env` from the project root via variable interpolation (`${GOOGLE_CLIENT_ID:-}`).

---

## 🗄️ Database Schema

```mermaid
erDiagram
    User ||--o{ RefreshToken : has
    User ||--o{ DeviceToken : has

    User {
        uuid id PK
        string email UK
        string name
        enum role "admin | conductor"
        string passwordHash
        enum provider "local | google"
        string googleId UK
        string avatar
        datetime createdAt
        datetime updatedAt
    }

    RefreshToken {
        uuid id PK
        uuid userId FK
        string tokenHash UK
        datetime expiresAt
        datetime createdAt
    }

    DeviceToken {
        uuid id PK
        uuid userId FK
        string token UK
        string platform
        datetime createdAt
    }
```

---

## 🎬 Backend-Only Demo

For a full manual backend demo flow (without frontend), including:

- service bring-up
- authenticated webhook execution
- optimizer/realtime validation
- Redis route persistence checks

See: [docs/backend-demo-runbook.md](docs/backend-demo-runbook.md)

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

MIT © 2026 LogiFlow — Escuela Colombiana de Ingenieria Julio Garavito
