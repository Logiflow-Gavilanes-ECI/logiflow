# Comprehensive Optimizer Service Explanation

> A deep dive into the LogiFlow Optimizer: architecture, technologies, and how to use it.

---

## Table of Contents

1. [What is the Vehicle Routing Problem (VRP)?](#what-is-the-vehicle-routing-problem-vrp)
2. [What is VROOM?](#what-is-vroom)
3. [What is gRPC?](#what-is-grpc)
4. [Routing Matrix Strategy](#routing-matrix-strategy)
5. [Architecture Overview](#architecture-overview)
6. [The gRPC Contract (optimizer.proto)](#the-grpc-contract-optimizerproto)
7. [The Docker Compose Stack](#the-docker-compose-stack)
8. [The gRPC Server (server.js)](#the-grpc-server-serverjs)
9. [The Dockerfile](#the-dockerfile)
10. [How to Run on Ubuntu](#how-to-run-on-ubuntu)
11. [How to Test](#how-to-test)
12. [Understanding the Data Flow](#understanding-the-data-flow)

---

## What is the Vehicle Routing Problem (VRP)?

The **Vehicle Routing Problem (VRP)** is a classic optimization problem in logistics and operations research. Imagine you have:

- **Multiple delivery trucks** (with different capacities)
- **Multiple delivery locations** (customers, warehouses)
- **Constraints** like time windows, vehicle skills, traffic

The question is: **What's the most efficient way to assign routes to all vehicles?**

```
Traditional approach:        Optimized approach:
                              
  Truck A: 1→3→5               Truck A: 1→2→3
  Truck B: 2→4→6               Truck B: 4→5→6
                              
  Total: 120 km               Total: 75 km
  Time: 4 hours              Time: 2.5 hours
```

VRP is NP-hard, meaning it gets exponentially harder as you add more variables. That's why we need specialized algorithms (like VROOM) rather than writing our own.

---

## What is VROOM?

**VROOM** (Vehicle Routing Open-source Optimization Machine) is an open-source optimization engine specifically designed to solve VRP and related problems.

### Why VROOM?

| Feature | Description |
|---------|-------------|
| **Open Source** | Free to use, no licensing fees |
| **Fast** | Solves complex VRP in seconds |
| **Flexible** | Supports time windows, skills, capacities, shipments |
| **REST API** | Easy to integrate with HTTP calls |
| **Active Community** | Well-maintained and documented |

### VROOM API Example

When you send a request to VROOM, it looks like this:

```json
{
  "jobs": [
    {
      "id": 1,
      "location": [-74.006, 4.679],
      "service": 300,
      "amount": [10]
    }
  ],
  "vehicles": [
    {
      "id": 1,
      "profile": "car",
      "start": [-74.05, 4.65],
      "end": [-74.05, 4.65],
      "capacity": [100]
    }
  ]
}
```

VROOM responds with optimized routes, including step-by-step directions, total distance, and estimated time.

---

## What is gRPC?

**gRPC** (Google Remote Procedure Call) is a high-performance RPC framework developed by Google. Unlike REST, which uses JSON over HTTP, gRPC uses **Protocol Buffers (proto3)** for efficient binary serialization.

### Why gRPC for Microservices?

| Aspect | REST (JSON) | gRPC (Protocol Buffers) |
|--------|-------------|------------------------|
| **Data Format** | Human-readable JSON | Binary (compact) |
| **Speed** | Slower | 7-10x faster |
| **Type Safety** | None (dynamic) | Strong (generated code) |
| **Streaming** | Limited | Native support |
| **Contracts** | Manual documentation | Auto-generated from .proto |

### How gRPC Works

```
Traditional REST:                      gRPC:

Client  ──JSON HTTP──▶  Server         Client  ──Binary──▶  Server
                                        │
                                        ▼
                                  Protocol Buffers
                                  (pre-compiled)
```

1. You define your API in a `.proto` file
2. The `protoc` compiler generates client/server code
3. Both sides use strongly-typed objects
4. Data is serialized as compact binary

### gRPC in LogiFlow

The Gateway (NestJS) calls the Optimizer via gRPC:

```javascript
// Gateway side (generated from proto)
const response = await client.optimizeRoutes({
  vehicles: [...],
  jobs: [...]
});
```

No manual JSON parsing, no type errors, blazing fast.

---

## Routing Matrix Strategy

The optimizer supports two matrix strategies:

- **Request matrix**: use the `matrix` sent in `OptimizeRequest`.
- **Google Routes matrix**: compute matrix values from Google Routes when `MATRIX_SOURCE=google`.

For Google mode, locations are resolved in this order:

1. `request.matrix.locations` if provided
2. otherwise, auto-built from `vehicles.start/end`, `jobs.location`, and `shipments.pickup/delivery`

This keeps Docker setup lightweight because matrix generation can be externalized instead of bootstrapping a local routing engine.

---

## Architecture Overview

Here's how all pieces fit together:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LogiFlow System                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐                          ┌──────────────────┐   │
│  │   Gateway    │                          │   Optimizer      │   │
│  │  (NestJS)    │  ─────── gRPC ────────▶ │   Service        │   │
│  │              │   port 50051             │                  │   │
│  └──────────────┘                          └────────┬─────────┘   │
│                                                      │              │
│                         ┌────────────────────────────┼──────────┐  │
│                         │                            ▼           │  │
│                         │                   ┌───────────────┐  │  │
│                         │                   │    VROOM       │  │  │
│                         │                   │  (port 3000)   │  │  │
│                         │                   └────────────────┘  │  │
│                         │                                        │  │
│                         │     docker-compose.yml                │  │
│                         └────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Gateway** receives a delivery request from the dispatcher
2. **Gateway** converts it to gRPC and calls `OptimizeRoutes` on port 50051
3. **Optimizer** (our Node.js gRPC server) receives the gRPC request
4. **Optimizer** translates it to VROOM's HTTP JSON format
5. **Optimizer** sends it to VROOM (port 3000)
6. **VROOM** runs its optimization algorithm using the request payload and matrix data
7. **VROOM** returns optimized routes
8. **Optimizer** translates VROOM's response back to gRPC format
9. **Gateway** receives the response and pushes routes to drivers via WebSocket

---

## The gRPC Contract (optimizer.proto)

The file `shared/proto/optimizer.proto` defines the contract between Gateway and Optimizer. This is the **single source of truth** — both services generate code from this file.

### Key Concepts

#### 1. Service Definition

```protobuf
service RouteOptimizer {
  rpc OptimizeRoutes (OptimizeRequest) returns (OptimizeResponse);
}
```

This defines one RPC method: `OptimizeRoutes` that takes a request and returns a response.

#### 2. OptimizeRequest

What the Gateway sends to the Optimizer:

```protobuf
message OptimizeRequest {
  repeated Vehicle vehicles = 1;    // Your fleet
  repeated Job jobs = 2;            // Delivery stops
  repeated Shipment shipments = 3; // Pickup+delivery pairs
  Matrix matrix = 4;                // Pre-computed distances
  Options options = 5;               // Algorithm settings
}
```

#### 3. Vehicle

Represents a truck/driver:

```protobuf
message Vehicle {
  string id = 1;              // "truck-001"
  Profile profile = 2;       // CAR, BICYCLE, FOOT
  Coordinate start = 3;      // Starting location
  Coordinate end = 4;        // Ending location
  int32 capacity = 5;        // Max load
  repeated int32 skills = 6; // [1] = refrigerated
  int32 time_window_start = 7; // Available from (seconds)
  int32 time_window_end = 8;   // Available until
}
```

#### 4. Job vs Shipment

- **Job**: A single delivery/pickup location
- **Shipment**: A pickup + delivery pair (e.g., restaurant to customer)

```protobuf
message Job {
  string id = 1;
  Coordinate location = 2;    // Where to go
  int32 service = 3;          // Time spent at location (seconds)
  int32 amount = 4;            // Package weight/units
  int32 time_window_start = 5;
  int32 time_window_end = 6;
  repeated int32 skills = 7;  // Required skills
  int32 priority = 8;          // 0=normal, 10=urgent
}
```

#### 5. Profile Enum

VROOM supports different transportation modes:

```protobuf
enum Profile {
  CAR = 0;      // Default, uses OSRM car profile
  BICYCLE = 1;  // Bike-friendly routes
  FOOT = 2;     // Pedestrian routes
}
```

---

## The Docker Compose Stack

File: `services/optimizer/docker-compose.yml`

This file defines two services that work together:

### Service 1: optimizer (Our gRPC Server)

```yaml
optimizer:
  build:
    context: .
    dockerfile: Dockerfile
  ports:
    - "50051:50051"
  environment:
    - VROOM_URL=http://vroom:3000
    - GRPC_PORT=50051
  depends_on:
    vroom:
      condition: service_started
```

- Builds our Node.js server from the Dockerfile
- Exposes port 50051 for gRPC connections
- Tells the server where VROOM is (`http://vroom:3000`)

### Service 2: vroom (VROOM Express)

```yaml
vroom:
  image: vroomproject/vroom-express:latest
  ports:
    - "3000:3000"
```

- Uses the official VROOM Express Docker image
- Acts as an HTTP API wrapper around VROOM's core

### Networks

```yaml
networks:
  logiflow-network:
    driver: bridge
```

All services communicate on a private Docker network. The optimizer can reach `http://vroom:3000`, but it's not exposed to the outside world.

---

## The gRPC Server (server.js)

This is our Node.js application that bridges gRPC and VROOM HTTP.

### Key Functions

#### 1. `mapProfile(profile)`

Converts proto enum to VROOM string:

```javascript
function mapProfile(profile) {
  const profileMap = {
    0: 'car',      // CAR
    1: 'bicycle', // BICYCLE
    2: 'foot',    // FOOT
  };
  return profileMap[profile] || 'car';
}
```

#### 2. `grpcToVroomRequest(req)`

Translates gRPC request to VROOM's HTTP format. Key transformations:

```javascript
// gRPC format:
{ id: "1", location: { lat: 4.679, lon: -74.006 } }

// VROOM format:
{ id: 1, location: [-74.006, 4.679] }  // [lon, lat] array
```

Other transformations:
- Proto snake_case → VROOM snake_case
- Single values → arrays (e.g., `amount` → `amount: [10]`)
- Time windows: `[start, end]` format

#### 3. `vroomToGrpcResponse(vroomRes)`

Converts VROOM's response back to gRPC format:

```javascript
// VROOM format:
{ vehicle_id: 1, distance: 15000, duration: 1800 }

// gRPC format:
{ vehicleId: "1", distance: BigInt(15000), duration: BigInt(1800) }
```

#### 4. `optimizeRoutes(call, callback)`

The main RPC handler:

```javascript
async function optimizeRoutes(call, callback) {
  try {
    // 1. Convert gRPC → VROOM
    const vroomRequest = grpcToVroomRequest(call.request);
    
    // 2. Call VROOM HTTP API
    const vroomRes = await axios.post(`${VROOM_URL}/optimize`, vroomRequest);
    
    // 3. Convert VROOM → gRPC
    const grpcResponse = vroomToGrpcResponse(vroomRes.data);
    
    // 4. Return response
    callback(null, grpcResponse);
  } catch (error) {
    callback(null, { code: 500, error: error.message });
  }
}
```

---

## The Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 50051

CMD ["node", "src/server.js"]
```

### Step-by-step Explanation

| Step | What it does |
|------|---------------|
| `FROM node:20-alpine` | Base image: Node.js 20 on lightweight Alpine Linux |
| `WORKDIR /app` | Set working directory inside container |
| `COPY package*.json ./` | Copy package.json and package-lock.json |
| `RUN npm ci --only=production` | Install production dependencies (no dev tools) |
| `COPY src/ ./src/` | Copy our server.js code |
| `EXPOSE 50051` | Document that we use port 50051 |
| `CMD ["node", "src/server.js"]` | Start the gRPC server |

---

## How to Run on Ubuntu

### Option 1: Full Docker Stack (Recommended)

```bash
# 1. Navigate to optimizer directory
cd services/optimizer

# 2. Build and start all services
docker compose up --build

# 3. Check if services are running
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE           PORTS
abc123         logiflow-optimizer  0.0.0.0:50051->50051/tcp
def456         logiflow-vroom      0.0.0.0:3000->3000/tcp
```

### Option 2: Local Development (Without Docker)

```bash
# 1. Install dependencies
cd services/optimizer
npm install

# 2. Start VROOM via Docker (required)
docker compose up vroom

# 3. Run our gRPC server locally
npm start
```

### Option 3: Connect to Existing VROOM

If you already have VROOM running elsewhere:

```bash
VROOM_URL=http://your-vroom-server:3000 npm start
```

---

## How to Test

### 1. Test VROOM Directly

```bash
# Check if VROOM is responding
curl -X POST http://localhost:3000/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "jobs": [{"id": 1, "location": [-74.006, 4.679], "service": 300}],
    "vehicles": [{"id": 1, "profile": "car", "start": [-74.05, 4.65], "end": [-74.05, 4.65]}]
  }'
```

### 2. Test gRPC (Using grpcurl)

```bash
# Install grpcurl
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# List available methods
grpcurl -plaintext localhost:50051 list

# Call OptimizeRoutes
grpcurl -plaintext -d '{
  "jobs": [{"id": "1", "location": {"lat": 4.679, "lon": -74.006}, "service": 300}],
  "vehicles": [{"id": "1", "profile": "CAR", "start": {"lat": 4.65, "lon": -74.05}, "end": {"lat": 4.65, "lon": -74.05}}]
}' localhost:50051 logiflow.RouteOptimizer.OptimizeRoutes
```

---

## Understanding the Data Flow

Let's trace a complete example:

### Step 1: Gateway Sends gRPC Request

```javascript
// Generated from optimizer.proto
const request = {
  vehicles: [
    {
      id: "truck-001",
      profile: "CAR",  // enum: 0
      start: { lat: 4.65, lon: -74.05 },
      end: { lat: 4.65, lon: -74.05 },
      capacity: 100
    }
  ],
  jobs: [
    {
      id: "job-001",
      location: { lat: 4.679, lon: -74.006 },
      service: 300,  // 5 minutes at location
      amount: 10
    },
    {
      id: "job-002",
      location: { lat: 4.720, lon: -74.020 },
      service: 180,
      amount: 5
    }
  ]
};
```

### Step 2: Optimizer Converts to VROOM Format

```javascript
// server.js: grpcToVroomRequest()
const vroomRequest = {
  vehicles: [
    {
      id: 1,
      profile: "car",
      start: [-74.05, 4.65],
      end: [-74.05, 4.65],
      capacity: [100]
    }
  ],
  jobs: [
    {
      id: 1,
      location: [-74.006, 4.679],
      service: 300,
      amount: [10]
    },
    {
      id: 2,
      location: [-74.020, 4.720],
      service: 180,
      amount: [5]
    }
  ]
};
```

### Step 3: VROOM Processes & Returns Routes

```json
{
  "code": 0,
  "routes": [
    {
      "vehicle_id": 1,
      "cost": 150,
      "distance": 12500,
      "duration": 1800,
      "steps": [
        { "type": "start", "location": [-74.05, 4.65] },
        { "type": "job", "id": 1, "location": [-74.006, 4.679], "arrival": 600, "departure": 900 },
        { "type": "job", "id": 2, "location": [-74.020, 4.720], "arrival": 1200, "departure": 1380 },
        { "type": "end", "location": [-74.05, 4.65] }
      ]
    }
  ],
  "summary": {
    "distance": 12500,
    "duration": 1800
  }
}
```

### Step 4: Optimizer Converts Back to gRPC

```javascript
const response = {
  code: 0,
  error: "",
  routes: [
    {
      vehicleId: "truck-001",
      cost: 150,
      distance: BigInt(12500),
      duration: BigInt(1800),
      steps: [
        { type: "start", id: "", location: { lat: 4.65, lon: -74.05 } },
        { type: "job", id: "job-001", location: { lat: 4.679, lon: -74.006 }, arrival: 600, departure: 900 },
        { type: "job", id: "job-002", location: { lat: 4.720, lon: -74.020 }, arrival: 1200, departure: 1380 },
        { type: "end", id: "", location: { lat: 4.65, lon: -74.05 } }
      ]
    }
  ],
  routingDistance: BigInt(12500),
  routingDuration: BigInt(1800)
};
```

---

## Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Optimizer** | Node.js + @grpc/grpc-js | gRPC server that bridges Gateway ↔ VROOM |
| **VROOM** | vroom-express | VRP optimization engine with HTTP API |
| **Matrix Source** | Request / Google Routes | Provides distances and durations for optimization |
| **Contract** | Protocol Buffers (.proto) | Type-safe API definition shared between services |

### Why This Architecture?

1. **Separation of Concerns**: VROOM is complex to run; we isolate it in Docker
2. **gRPC for Performance**: Gateway ↔ Optimizer communication is fast and type-safe
3. **Flexible Matrix Strategy**: Use provided matrix or Google Routes depending on environment
4. **Docker Compose**: Easy to deploy, reproducible environment
5. **Proto Contract**: Single source of truth, no mismatched APIs

---

## Next Steps

- Integrate with Gateway (NestJS) to call this service
- Add authentication/authorization
- Implement the AI Traffic Predictor to adjust cost matrices
- Add metrics and logging

---

> Last updated: March 2026
