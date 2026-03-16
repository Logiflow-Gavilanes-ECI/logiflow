FROM node:20-alpine

WORKDIR /app

COPY services/optimizer/package*.json ./

# RUN npm ci --only=production
RUN npm ci --omit=dev

COPY services/optimizer/src/ ./src/
COPY shared/proto/ ./shared/proto/

EXPOSE 50051

CMD ["node", "src/server.js"]
