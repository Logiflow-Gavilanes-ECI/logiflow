# syntax=docker/dockerfile:1.7
# Pin platform: VROOM and grpc native deps must run on linux/amd64 in
# production EC2 even when developers build on Apple Silicon.
ARG TARGETPLATFORM=linux/amd64

FROM --platform=${TARGETPLATFORM} node:20-alpine AS deps
WORKDIR /app
COPY services/optimizer/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM --platform=${TARGETPLATFORM} node:20-alpine AS runtime
RUN apk add --no-cache dumb-init tini
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NODE_OPTIONS="--enable-source-maps"

COPY --from=deps /app/node_modules ./node_modules
COPY services/optimizer/package*.json ./
COPY services/optimizer/src/ ./src/
COPY shared/proto/ ./shared/proto/

RUN addgroup -S optimizer && adduser -S optimizer -G optimizer \
    && chown -R optimizer:optimizer /app

USER optimizer

EXPOSE 50051 9090

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
