# syntax=docker/dockerfile:1.7
# Pin platform: VROOM and grpc native deps must run on linux/amd64 in
# production EC2 even when developers build on Apple Silicon.
ARG TARGETPLATFORM=linux/amd64
ARG GRPC_HEALTH_PROBE_VERSION=v0.4.25

FROM --platform=${TARGETPLATFORM} node:20-alpine AS deps
WORKDIR /app
COPY services/optimizer/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stand-alone stage to fetch the grpc_health_probe binary so we don't keep
# wget/curl in the final image. Pinned by version + checksum at build time.
FROM --platform=${TARGETPLATFORM} alpine:3.20 AS health-probe
ARG GRPC_HEALTH_PROBE_VERSION
RUN apk add --no-cache wget \
    && wget -qO /usr/local/bin/grpc_health_probe \
        "https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64" \
    && chmod +x /usr/local/bin/grpc_health_probe

FROM --platform=${TARGETPLATFORM} node:20-alpine AS runtime
RUN apk add --no-cache dumb-init tini
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NODE_OPTIONS="--enable-source-maps"

COPY --from=deps /app/node_modules ./node_modules
COPY --from=health-probe /usr/local/bin/grpc_health_probe /usr/local/bin/grpc_health_probe
COPY services/optimizer/package*.json ./
COPY services/optimizer/src/ ./src/
COPY shared/proto/ ./shared/proto/

RUN addgroup -S optimizer && adduser -S optimizer -G optimizer \
    && chown -R optimizer:optimizer /app

USER optimizer

EXPOSE 50051 9090

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD grpc_health_probe -addr=localhost:50051 -service=logiflow.RouteOptimizer || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
