FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# RUN npm ci --only=production
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 50051

CMD ["node", "src/server.js"]
