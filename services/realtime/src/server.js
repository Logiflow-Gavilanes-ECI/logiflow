const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { pubClient, subClient } = require('./redis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);

app.use(cors());

const io = new Server(httpServer, {
  cors: { origin: '*' }
});

async function initializeServer() {
  io.adapter(createAdapter(pubClient, subClient));
  console.log('Redis adapter connected');
}

module.exports = { app, httpServer, io, initializeServer };