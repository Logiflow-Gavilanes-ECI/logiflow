# Shared Contracts

This directory stores cross-service contracts used by multiple services.

## Canonical Vehicle ID Format

Use `v-001` as the canonical vehicle identifier format across the platform:

- lowercase prefix: `v`
- hyphen separator: `-`
- zero-padded numeric suffix: `001`, `002`, ...

Examples:

- `v-001`
- `v-027`
- `v-120`

## Why It Matters

A consistent string vehicle ID is required for end-to-end routing and tracking:

- optimizer route mapping (`vehicle_id` in optimization responses)
- gateway payload handling and route assignment
- realtime channel naming (for example `vehicle:v-001`)
- Redis key consistency (for example `route:vehicle:v-001`)

Do not coerce vehicle IDs to numbers. Keep IDs as strings in all services.

## Proto Contract

`shared/proto/optimizer.proto` defines the gRPC contract shared by gateway and optimizer.

When this proto changes:

1. update gateway interfaces that mirror request/response shapes
2. verify optimizer can load the proto path
3. verify gateway can connect to optimizer without proto loader errors
