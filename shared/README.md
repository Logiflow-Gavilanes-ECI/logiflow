<div align="center">

# LogiFlow Shared Contracts

Cross-service contracts, protocol definitions, and canonical formats shared across all LogiFlow services.

[![gRPC](https://img.shields.io/badge/gRPC-Proto3-244c5a?logo=google&logoColor=white)](https://grpc.io/)

</div>

---

## Contents

```text
shared/
├── proto/
│   └── optimizer.proto    ← gRPC contract for RouteOptimizer service
└── README.md
```

---

## Canonical Vehicle ID Format

All services **must** use the following format for vehicle identifiers:

| Component | Format | Example |
|-----------|--------|---------|
| Prefix | lowercase `v` | `v` |
| Separator | hyphen `-` | `-` |
| Suffix | zero-padded number | `001` |

**Examples:** `v-001`, `v-027`, `v-120`

### Why Consistency Matters

The vehicle ID format is used end-to-end across the entire platform:

| Service | Usage |
|---------|-------|
| **Optimizer** | `vehicle_id` in optimization responses |
| **Gateway** | Payload handling and route assignment |
| **Realtime** | Socket.io channel naming (`vehicle:v-001`) |
| **Redis** | Key consistency (`route:vehicle:v-001`) |

> **Do not coerce vehicle IDs to numbers.** Keep IDs as strings in all services.

---

## Proto Contract

`shared/proto/optimizer.proto` defines the gRPC contract shared by the Gateway and Optimizer services.

```protobuf
service RouteOptimizer {
  rpc OptimizeRoutes (OptimizeRequest) returns (OptimizeResponse);
}
```

See the full `.proto` file for complete message definitions including `Vehicle`, `Job`, `Shipment`, `Matrix`, and `Options`.

### When the Proto Changes

1. Update Gateway interfaces that mirror request/response shapes.
2. Verify the Optimizer can load the proto path.
3. Verify the Gateway can connect to the Optimizer without proto loader errors.
4. Run integration tests in both services.
