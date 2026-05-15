# LogiFlow Socket Gateway

Real-time communication service for LogiFlow. Handles WebSocket connections using Socket.io with Redis adapter for scalable event broadcasting to drivers and dispatchers.

## What this service does

- Broadcasts live vehicle GPS positions every 5 seconds to connected clients
- Re-emits driver status updates to dispatchers and the driver's vehicle room
- Emits route update events when the routing optimizer (NestJS) calculates a new route
- Manages rooms so each client only receives relevant events
- Exposes an HTTP endpoint for NestJS to trigger route updates

## Requirements

- Node.js v20+
- Docker (for Redis)

## Setup

**1. Clone and install dependencies:**
```bash
git clone <repo-url>
cd services/realtime
npm install
```

**2. Configure environment variables:**
```bash
cp .env.example .env
```

Your `.env` should have:
```
PORT=3001
REDIS_URL=redis://localhost:6379
```

**3. Start Redis with Docker:**
```bash
docker run -d --name redis-logiflow -p 6379:6379 redis:7
```

**4. Start the server:**
```bash
node src/index.js
```

You should see:
```
Redis adapter connected
Socket Gateway running on port 3001
```

## Rooms

| Room | Who joins | What they receive |
|---|---|---|
| `fleet` | Dispatchers | All vehicle positions, status updates, and route updates |
| `vehicle:v-001` | Driver of v-001 | Only v-001 position, status updates, and route updates |

## Socket.io Events

### Events the client must emit (to join rooms)

**Join fleet room (dispatcher view):**
```js
socket.emit('join:fleet')
```

**Join specific vehicle room (driver view):**
```js
socket.emit('join:vehicle', { vehicleId: 'v-001' })
```

**Driver status update:**
```js
socket.emit('vehicle:status', {
  vehicleId: 'v-001',
  status: 'ARRIVED',
  stopId: 's-101',
  timestamp: '2026-05-12T17:00:00.000Z'
})
```

### Events the client receives

**Vehicle position (every 5 seconds):**
```js
socket.on('vehicle:position', (data) => {
  console.log(data)
  // {
  //   vehicleId: 'v-001',
  //   lat: 4.7110,
  //   lng: -74.0721,
  //   speed: 45,
  //   timestamp: '2026-03-05T10:00:00Z'
  // }
})
```

**Vehicle status:**
```js
socket.on('vehicle:status', (data) => {
  console.log(data)
  // {
  //   vehicleId: 'v-001',
  //   status: 'START',
  //   stopId: 's-101',
  //   timestamp: '2026-05-12T17:00:00.000Z'
  // }
})
```

**Route update:**
```js
socket.on('route:update', (data) => {
  console.log(data)
  // {
  //   vehicleId: 'v-001',
  //   stops: [
  //     { lat: 4.7110, lng: -74.0721, address: 'Calle 72' },
  //     { lat: 4.6800, lng: -74.0500, address: 'Av. El Dorado' }
  //   ],
  //   polyline: [
  //     { lat: 4.7110, lng: -74.0721 },
  //     { lat: 4.7050, lng: -74.0680 },
  //     { lat: 4.6900, lng: -74.0600 },
  //     { lat: 4.6800, lng: -74.0500 }
  //   ],
  //   estimatedTime: 35,
  //   timestamp: '2026-03-05T10:00:00Z'
  // }
})
```

**Confirmation when joining a room:**
```js
socket.on('joined', (data) => {
  console.log(data)
  // { room: 'fleet' } or { room: 'vehicle:v-001' }
})
```

## HTTP Endpoint (for NestJS integration)

### Trigger a route update


```
POST http://localhost:3001/emit/route-update
Content-Type: application/json
```

Request body:
```json
{
  "vehicleId": "v-001",
  "stops": [
    { "lat": 4.7110, "lng": -74.0721, "address": "Calle 72" },
    { "lat": 4.6800, "lng": -74.0500, "address": "Av. El Dorado" }
  ],
  "polyline": [
    { "lat": 4.7110, "lng": -74.0721 },
    { "lat": 4.7050, "lng": -74.0680 },
    { "lat": 4.6900, "lng": -74.0600 },
    { "lat": 4.6800, "lng": -74.0500 }
  ],
  "estimatedTime": 35
}
```

Response:
```json
{ "success": true }
```

## Testing

Open `test/client.html` directly in your browser 

The test client lets you:
- Connect to the server and see your Socket ID
- Join fleet or vehicle rooms
- See live vehicle position updates every 5 seconds
- Trigger a simulated route update

**To test that rooms work correctly:**
1. Open `test/client.html` in two browser tabs
2. Tab 1 → click "Join Vehicle v-001"
3. Tab 2 → click "Join Vehicle v-002"
4. Click "Trigger Route Update for v-001"
5. Only Tab 1 should receive the route update

## Project structure
```
src/
├── index.js          ← entry point, starts the server
├── server.js         ← Express + Socket.io + Redis adapter setup
├── redis.js          ← Redis connection
├── rooms.js          ← room management (fleet, vehicle:{id})
└── events/
    ├── position.js   ← GPS position broadcast every 5s
    ├── status.js     ← driver status update broadcast
    └── routeUpdate.js ← route update event emission
test/
└── client.html       ← HTML test client
```
