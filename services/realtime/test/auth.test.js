const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../src/middleware/auth');

const TEST_SECRET = 'test-secret-for-auth-tests';

describe('authMiddleware', () => {
  let mockSocket;
  let mockNext;

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    mockSocket = {
      handshake: { auth: {} },
    };
    mockNext = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects connection without token', () => {
    authMiddleware(mockSocket, mockNext);

    expect(mockNext).toHaveBeenCalledWith(new Error('Unauthorized'));
  });

  test('rejects connection with invalid token', () => {
    mockSocket.handshake.auth = { token: 'this.is.not.a.valid.jwt' };

    authMiddleware(mockSocket, mockNext);

    expect(mockNext).toHaveBeenCalledWith(new Error('Unauthorized'));
  });

  test('rejects connection with expired token', () => {
    const expiredToken = jwt.sign(
      { sub: 'user-uuid-1', role: 'admin', username: 'demo' },
      TEST_SECRET,
      { expiresIn: -10 }
    );
    mockSocket.handshake.auth = { token: expiredToken };

    authMiddleware(mockSocket, mockNext);

    expect(mockNext).toHaveBeenCalledWith(new Error('Unauthorized'));
  });

  test('accepts valid token and attaches userId and role to socket', () => {
    const token = jwt.sign(
      { sub: 'user-uuid-123', role: 'admin', username: 'demo' },
      TEST_SECRET,
      { expiresIn: '1h' }
    );
    mockSocket.handshake.auth = { token };

    authMiddleware(mockSocket, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(mockSocket.userId).toBe('user-uuid-123');
    expect(mockSocket.role).toBe('admin');
  });
});
