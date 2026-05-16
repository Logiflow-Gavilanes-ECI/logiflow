'use strict';

const jwt = require('jsonwebtoken');

/**
 * Socket.io JWT middleware.
 * Reads the token from socket.handshake.auth.token and attaches
 * userId and role to the socket after successful validation.
 */
function authMiddleware(socket, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET is not configured');
    return next(new Error('Server misconfigured'));
  }

  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Unauthorized'));
  }

  try {
    const payload = jwt.verify(token, secret);

    socket.userId = payload.sub;
    socket.role   = payload.role;

    next();
  } catch (err) {
    console.error('[auth] JWT verification failed:', err.message);
    next(new Error('Unauthorized'));
  }
}

module.exports = { authMiddleware };
