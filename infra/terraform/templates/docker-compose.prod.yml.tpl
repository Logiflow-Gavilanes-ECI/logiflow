services:
  nginx:
    image: nginx:alpine
    container_name: logiflow-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - gateway
      - realtime
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    container_name: logiflow-certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h & wait $${!}; done'"
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: logiflow-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${db_password}
      POSTGRES_DB: logiflow_gateway
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d logiflow_gateway"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: logiflow-redis
    command: redis-server --requirepass ${db_password}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${db_password}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  vroom:
    build:
      context: ./services/optimizer
      dockerfile: Dockerfile.vroom
    container_name: logiflow-vroom
    restart: unless-stopped

  optimizer:
    build:
      context: .
      dockerfile: services/optimizer/Dockerfile
    container_name: logiflow-optimizer
    environment:
      GRPC_PORT: 50051
      VROOM_URL: http://vroom:3000
      REDIS_URL: redis://:${db_password}@redis:6379
      OPTIMIZER_PROTO_PATH: /app/shared/proto/optimizer.proto
      MATRIX_SOURCE: request
      GOOGLE_ROUTES_ENABLED: "false"
      GOOGLE_ROUTES_ALLOW_CALLS: "false"
      GOOGLE_ROUTES_MOCK: "true"
      AI_PREDICTOR_ENABLED: "true"
      AI_PREDICTOR_URL: http://ai-predictor:5001/adjust
    depends_on:
      vroom:
        condition: service_started
      redis:
        condition: service_healthy
      ai-predictor:
        condition: service_started
    restart: unless-stopped

  ai-predictor:
    image: python:3.12-alpine
    container_name: logiflow-ai-predictor
    working_dir: /workspace/services/ai-predictor
    command: sh -c "pip install --no-cache-dir -r requirements.txt && python predictor.py"
    volumes:
      - ./services/ai-predictor:/workspace/services/ai-predictor:ro
    restart: unless-stopped

  realtime:
    image: node:22-alpine
    container_name: logiflow-realtime
    working_dir: /workspace/services/realtime
    command: sh -c "npm install --production && node src/index.js"
    volumes:
      - ./services/realtime:/workspace/services/realtime
    environment:
      PORT: 3001
      REDIS_URL: redis://:${db_password}@redis:6379
      JWT_SECRET: ${jwt_secret}
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  gateway:
    image: node:22-alpine
    container_name: logiflow-gateway
    working_dir: /workspace/services/gateway
    command: sh -c "npm install && npx prisma generate && npx prisma migrate deploy && npm run db:seed && npx tsc -p tsconfig.build.json && node dist/src/main.js"
    volumes:
      - ./services/gateway:/workspace/services/gateway
      - ./shared:/workspace/shared
    environment:
      PORT: 3002
      DATABASE_URL: postgresql://postgres:${db_password}@postgres:5432/logiflow_gateway?schema=public
      GRPC_OPTIMIZER_HOST: optimizer
      GRPC_OPTIMIZER_PORT: 50051
      GRPC_OPTIMIZER_PROTO_PATH: ../../shared/proto/optimizer.proto
      SOCKETIO_SERVER_HOST: realtime
      SOCKETIO_SERVER_PORT: 3001
      JWT_SECRET: ${jwt_secret}
      JWT_EXPIRES_IN: 1h
      CORS_ORIGINS: https://logiflowapp.z13.web.core.windows.net,http://localhost:4200,capacitor://localhost,http://localhost
    depends_on:
      postgres:
        condition: service_healthy
      optimizer:
        condition: service_started
      realtime:
        condition: service_started
    restart: unless-stopped

volumes:
  postgres_data:
