# 🧮 Optimizer Service

> VROOM-powered gRPC server for solving the Vehicle Routing Problem (VRP).

## Overview

The Optimizer service provides route optimization capabilities by acting as a bridge between the NestJS Gateway and VROOM (Vehicle Routing Open-source Optimization Machine). It exposes a gRPC interface that translates gateway requests into VROOM HTTP API calls.

## Architecture

```
┌─────────────────┐     gRPC (50051)      ┌─────────────────┐
│   NestJS        │ ─────────────────────▶│    Optimizer    │
│   Gateway       │                       │    Service      │
└─────────────────┘                       └────────┬────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │      VROOM      │
                                          │   (port 3000)   │
                                          └────────┬────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │      OSRM       │
                                          │  (Colombia PBF) │
                                          └─────────────────┘
```

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ (for local development)

### Run with Docker

```bash
# Required before running docker compose:
mkdir -p services/optimizer/osrm-data
curl -L --progress-bar \
  https://download.geofabrik.de/south-america/colombia-latest.osm.pbf \
  -o services/optimizer/osrm-data/colombia-latest.osm.pbf

cd services/optimizer
npm install
docker compose up --build

```

> ⚠️ **First run:** OSRM will download and process the Colombia map (~200MB).
> This takes 10–30 minutes. Subsequent runs use cached data and start in seconds.
This starts:
- **optimizer** - gRPC server on port `50051`
- **vroom** - VROOM Express API on port `3000` (internal)
- **osrm** - OSRM routing backend with Colombia map data

### Run Locally

```bash
cd services/optimizer
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | `50051` | gRPC server port |
| `VROOM_URL` | `http://vroom:3000` | VROOM API endpoint |
| `VROOM_OPTIMIZE_PATH` | `/` | VROOM optimize endpoint path (vroom-express default) |
| `MATRIX_SOURCE` | `request` | Matrix source strategy (`request` or `google`) |
| `OPTIMIZER_VALIDATE_MATRIX_ONLY` | `false` | If true, returns computed matrix directly and skips VROOM solve |
| `GOOGLE_ROUTES_ENABLED` | `false` | Master switch for Google matrix mode |
| `GOOGLE_ROUTES_ALLOW_CALLS` | `false` | Allows live Google API calls only when explicitly enabled |
| `GOOGLE_ROUTES_MOCK` | `true` | Uses local mock matrix and avoids external billing |
| `MAX_GOOGLE_MATRIX_LOCATIONS` | `10` | Guardrail limit for matrix size |
| `GOOGLE_ROUTES_CACHE_TTL_MS` | `300000` | In-memory cache TTL to avoid repeated matrix calls |
| `GOOGLE_MAPS_API_KEY` | `` | API key for Google Routes API |
| `GOOGLE_ROUTES_TIMEOUT_MS` | `20000` | Timeout in milliseconds for Google Routes matrix requests |
| `GOOGLE_ROUTES_DEPARTURE_TIME` | `` | Optional RFC3339 departure time (e.g. `2026-03-17T14:30:00Z`) |

### Google Routes Matrix (Sprint 2)

The optimizer now includes a Google Routes client.

Use Google as matrix source by setting:

```bash
MATRIX_SOURCE=google
GOOGLE_MAPS_API_KEY=<your-api-key>
```

Recommended safe defaults while testing:

```bash
GOOGLE_ROUTES_ENABLED=true
GOOGLE_ROUTES_ALLOW_CALLS=false
GOOGLE_ROUTES_MOCK=true
MAX_GOOGLE_MATRIX_LOCATIONS=10
```

Current behavior:

- If `MATRIX_SOURCE=request`, optimizer uses the matrix sent in gRPC request.
- If `MATRIX_SOURCE=google`, optimizer computes distances/durations with Google Routes and injects that matrix into the VROOM payload.
- For `MATRIX_SOURCE=google`, locations are resolved in this order:
  1. `request.matrix.locations` if provided
  2. otherwise auto-built from `vehicles.start/end`, `jobs.location`, and `shipments.pickup/delivery` (deduplicated)
- If `GOOGLE_ROUTES_MOCK=true`, matrix is generated locally (no external API call, no billing).
- Live Google calls require all of: `GOOGLE_ROUTES_ENABLED=true`, `GOOGLE_ROUTES_ALLOW_CALLS=true`, and a valid `GOOGLE_MAPS_API_KEY`.

## gRPC Contract

The service implements `RouteOptimizer` defined in `shared/proto/optimizer.proto`:

```protobuf
service RouteOptimizer {
  rpc OptimizeRoutes (OptimizeRequest) returns (OptimizeResponse);
}
```

See `shared/proto/optimizer.proto` for full message definitions.

## Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Lint
npm run lint
```

## Project Structure

```
services/optimizer/
├── docker-compose.yml    # VROOM + OSRM + optimizer stack
├── Dockerfile           # gRPC server container
├── package.json         # Node.js dependencies
├── src/
│   └── server.js        # gRPC server implementation
└── .dockerignore
```

## Dependencies

- `@grpc/grpc-js` - gRPC runtime
- `@grpc/proto-loader` - Protocol Buffer loader
- `axios` - HTTP client for VROOM API

## See Also

- [Comprehensive Optimizer Explanation](./comprehensive-optimizer-explanation.md)
- [Monorepo README](../README.md)
