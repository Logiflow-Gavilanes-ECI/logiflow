<div align="center">

# LogiFlow Core Backend

NestJS service that orchestrates webhook events, gRPC route optimization, real-time socket updates, and CRUD APIs for vehicles/stops.

[![NestJS](https://img.shields.io/badge/NestJS-11.x-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.5-2d3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Jest](https://img.shields.io/badge/Tests-62%20passing-c21325?logo=jest&logoColor=white)](https://jestjs.io/)

</div>

---

## 📑 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup (Prisma)](#database-setup-prisma)
  - [Run the App](#run-the-app)
- [API Endpoints](#api-endpoints)
  - [Health Check](#health-check)
  - [Webhook](#webhook)
  - [Vehicles CRUD](#vehicles-crud)
  - [Stops CRUD](#stops-crud)
- [Reliability and Traceability](#reliability-and-traceability)
- [Testing](#testing)
- [Team](#team)

---

## Overview

LogiFlow is an ARSW - Software Architecture university project that solves dynamic fleet routing in real time. When logistics events occur (new orders, traffic changes, vehicle incidents), this gateway:

1. Receives events from n8n via webhook.
2. Calls a gRPC optimizer service (VROOM).
3. Emits route updates to a Socket.io real-time service.
4. Exposes REST APIs for vehicles and stops.
5. Persists vehicle/stop data in PostgreSQL through Prisma.

---

## Architecture

```text
n8n (HTTP webhook)
        |
        v
NestJS Gateway (api/v1)
  - CorrelationId middleware
  - Webhook module
  - Retry service (exponential backoff + jitter)
  - Prisma repositories (vehicles/stops)
        |
        +--> gRPC Optimizer (RouteOptimizer.OptimizeRoutes)
        |
        +--> Socket.io Realtime Gateway (route-update)
```

### Event Data Flow

```text
POST /webhook
  -> validate payload (DTO + ValidationPipe)
  -> ensure correlation id
  -> retry grpc.optimizeRoutes (max 3)
  -> fallback mock route if optimizer unavailable
  -> retry socket.emitRouteUpdate (max 5)
  -> return HTTP response with fallback metadata
```

---

## Tech Stack

| Technology | Purpose | Version |
|---|---|---|
| NestJS | Modular backend framework | 11.x |
| TypeScript | Type-safe development | 5.7 |
| Prisma | ORM and DB access | 7.5 |
| PostgreSQL | Persistent storage | 15+ |
| @grpc/grpc-js | gRPC client for optimizer | 1.14 |
| socket.io-client | Real-time route emission | 4.8 |
| class-validator / class-transformer | DTO validation and transformation | 0.15 / 0.5 |
| Jest + ts-jest | Unit/integration/e2e tests | 30.x |

---

## Project Structure

```text
services/gateway/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── constants/
│   │   │   └── correlation-id.constant.ts
│   │   ├── middleware/
│   │   │   └── correlation-id.middleware.ts
│   │   └── retry/
│   │       ├── retry.module.ts
│   │       ├── retry.service.ts
│   │       ├── retry.options.ts
│   │       └── retry-exhausted.exception.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── generated/prisma/
│   │   └── client.ts
│   ├── webhook/
│   │   ├── webhook.controller.ts
│   │   ├── webhook.service.ts
│   │   ├── webhook.service.spec.ts
│   │   └── webhook-retry.spec.ts
│   ├── grpc-client/
│   ├── socket-client/
│   ├── vehicles/
│   │   ├── vehicles.repository.ts
│   │   └── vehicles.service.ts
│   └── stops/
│       ├── stops.repository.ts
│       └── stops.service.ts
└── test/
    ├── app.e2e-spec.ts
    └── jest-e2e.json
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- npm 10+
- PostgreSQL instance

### Installation

```bash
cd services/gateway
npm install
```

### Environment Variables

Create a `.env` file in `services/gateway`.

| Variable | Default | Description |
|---|---|---|
| PORT | `3000` | HTTP server port |
| DATABASE_URL | none | Prisma PostgreSQL connection string |
| GRPC_OPTIMIZER_HOST | `localhost` | Optimizer host |
| GRPC_OPTIMIZER_PORT | `50051` | Optimizer port |
| GRPC_OPTIMIZER_PROTO_PATH | `../../shared/proto/optimizer.proto` | Shared optimizer proto path |
| SOCKETIO_SERVER_HOST | `localhost` | Socket.io host |
| SOCKETIO_SERVER_PORT | `3001` | Socket.io port |

Example:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/logiflow?schema=public"
GRPC_OPTIMIZER_HOST=localhost
GRPC_OPTIMIZER_PORT=50051
GRPC_OPTIMIZER_PROTO_PATH=../../shared/proto/optimizer.proto
SOCKETIO_SERVER_HOST=localhost
SOCKETIO_SERVER_PORT=3001
```

### Database Setup (Prisma)

```bash
# apply migrations
npx prisma migrate deploy

# for local development, you can also create a dev migration
# npx prisma migrate dev --name init_gateway_models

# regenerate prisma client if schema changes
npx prisma generate
```

### Run the App

```bash
# development
npm run start:dev

# production
npm run build
npm run start:prod
```

Base URL: `http://localhost:3000/api/v1`

---

## API Endpoints

All routes are prefixed with `/api/v1`.

### Health Check

| Method | Endpoint |
|---|---|
| GET | `/health` |

### Webhook

| Method | Endpoint |
|---|---|
| POST | `/webhook` |

Valid `eventType` values: `traffic_jam`, `new_order`, `vehicle_breakdown`, `weather_change`.

Request body:

```json
{
  "eventType": "new_order",
  "vehicles": [{ "id": "v1", "start": { "lat": 4.711, "lon": -74.072 }, "capacity": 100 }],
  "jobs": [{ "id": "j1", "location": { "lat": 4.609, "lon": -74.081 }, "amount": 20 }],
  "options": { "metric": "duration", "optimize": true, "algorithm": "greedy" }
}
```

Compatibility note: legacy `stops` payloads with `lat/lng/demand` are still accepted and internally mapped to `jobs`.

Example response:

```json
{
  "received": true,
  "eventType": "new_order",
  "vehicleCount": 1,
  "stopCount": 0,
  "jobCount": 1,
  "correlationId": "2bf53f08-34d6-4203-bf79-f524e44bbf3a",
  "optimizedRoutes": { "code": "0", "error": "", "routes": [], "routingDistance": "0", "routingDuration": "0" },
  "fallback": false,
  "socketConnected": true,
  "timestamp": "2026-03-14T00:00:00.000Z"
}
```

Note: `fallbackReason` is returned only when `fallback` is `true`.

### Vehicles CRUD

| Method | Endpoint |
|---|---|
| GET | `/vehicles` |
| GET | `/vehicles/:id` |
| POST | `/vehicles` |
| PUT | `/vehicles/:id` |
| DELETE | `/vehicles/:id` |

### Stops CRUD

| Method | Endpoint |
|---|---|
| GET | `/stops` |
| GET | `/stops/:id` |
| POST | `/stops` |
| PUT | `/stops/:id` |
| DELETE | `/stops/:id` |

---

## Reliability and Traceability

### Correlation Id

- Header used: `x-correlation-id`.
- If missing, middleware generates a UUID.
- The same id is propagated to:
  - webhook logs,
  - gRPC metadata,
  - socket emission payload,
  - webhook HTTP response.

### Retry Policy

- Generic retry engine: `RetryService.execute()`.
- Backoff strategy: exponential + jitter.
- Optimizer retries: `maxAttempts = 3`.
- Socket retries: `maxAttempts = 5`.
- Exhaustion behavior:
  - optimizer: activates fallback route generation,
  - socket: logs error but still returns successful webhook response.

---

## Testing

```bash
# all unit + integration specs under src/**/*.spec.ts
npm test

# e2e
npm run test:e2e

# coverage
npm run test:cov
```

Current status (latest run):

- 12 test suites passing.
- 62 tests passing.
- Includes retry integration coverage in `webhook-retry.spec.ts`.

---

## Team

Los Gavilanes del Codigo - ARSW, Escuela Colombiana de Ingenieria

- Juan Sebastian Ortega - NestJS Core Backend + Simple Map
- Cristian - VROOM Route Optimizer (Python, gRPC server)
- Elizabeth - Socket.io Real-Time Gateway (Node.js)
- Andersson - n8n Workflow Automation

---

<div align="center">

Sprint 2 - March 2026

</div>
