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
cd services/optimizer
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
