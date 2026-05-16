import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import * as net from 'node:net';
import { ActiveRouteRepository } from './active-route.repository';

jest.mock('node:net', () => ({
  createConnection: jest.fn(),
}));

class FakeRedisSocket extends EventEmitter {
  readonly writtenCommands: string[] = [];
  readonly setTimeout = jest.fn();
  readonly end = jest.fn();
  readonly write = jest.fn((command: string | Uint8Array) => {
    this.writtenCommands.push(command.toString());
    const chunks = this.responses.shift() ?? [];
    chunks.forEach((chunk) => {
      setImmediate(() => this.emit('data', chunk));
    });
    return true;
  });

  constructor(private readonly responses: Buffer[][]) {
    super();
  }
}

const createConnectionMock = net.createConnection as jest.MockedFunction<
  typeof net.createConnection
>;

function configService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string, fallback?: string | number) => {
      return values[key] ?? fallback;
    }),
  } as unknown as ConfigService;
}

function simple(value: string) {
  return Buffer.from(`+${value}\r\n`);
}

function errorReply(value: string) {
  return Buffer.from(`-${value}\r\n`);
}

function integer(value: number) {
  return Buffer.from(`:${value}\r\n`);
}

function bulk(value: string | null) {
  if (value === null) {
    return Buffer.from('$-1\r\n');
  }

  return Buffer.from(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
}

function splitBulk(value: string) {
  const header = `$${Buffer.byteLength(value)}\r\n`;
  return [
    Buffer.from(`${header}${value.slice(0, 5)}`),
    Buffer.from(`${value.slice(5)}\r\n`),
  ];
}

describe('ActiveRouteRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null without opening a socket when Redis is not configured', async () => {
    const repository = new ActiveRouteRepository(configService({}));

    await expect(repository.findByVehicleId('v-001')).resolves.toBeNull();
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('reads and validates a cached active route using auth and database selection', async () => {
    const cachedRoute = {
      vehicleId: 'v-001',
      route: {
        steps: [{ type: 'job', id: 's-001', location: { lat: 4.7, lon: -74 } }],
      },
      correlationId: 'corr-1',
      persistedAt: '2026-05-14T12:00:00.000Z',
    };
    const socket = new FakeRedisSocket([
      [simple('OK')],
      [simple('OK')],
      [bulk(JSON.stringify(cachedRoute))],
    ]);
    createConnectionMock.mockReturnValueOnce(socket as unknown as net.Socket);
    const repository = new ActiveRouteRepository(
      configService({
        REDIS_URL: 'redis://gateway:p%40ss@redis.internal:6380/2',
        REDIS_ROUTE_READ_TIMEOUT_MS: '250',
      }),
    );

    const lookup = repository.findByVehicleId('v-001');
    socket.emit('connect');

    await expect(lookup).resolves.toEqual(cachedRoute);
    expect(createConnectionMock).toHaveBeenCalledWith({
      host: 'redis.internal',
      port: 6380,
    });
    expect(socket.setTimeout).toHaveBeenCalledWith(250);
    expect(socket.writtenCommands[0]).toContain('AUTH');
    expect(socket.writtenCommands[0]).toContain('gateway');
    expect(socket.writtenCommands[0]).toContain('p@ss');
    expect(socket.writtenCommands[1]).toContain('SELECT');
    expect(socket.writtenCommands[1]).toContain('2');
    expect(socket.writtenCommands[2]).toContain('GET');
    expect(socket.writtenCommands[2]).toContain('route:vehicle:v-001');
    expect(socket.end).toHaveBeenCalledTimes(1);
  });

  it('uses default Redis port and timeout fallback, then returns null for a missing key', async () => {
    const socket = new FakeRedisSocket([[bulk(null)]]);
    createConnectionMock.mockReturnValueOnce(socket as unknown as net.Socket);
    const repository = new ActiveRouteRepository(
      configService({
        REDIS_URL: 'redis://localhost',
        REDIS_ROUTE_READ_TIMEOUT_MS: '0',
      }),
    );

    const lookup = repository.findByVehicleId('v-404');
    socket.emit('connect');

    await expect(lookup).resolves.toBeNull();
    expect(createConnectionMock).toHaveBeenCalledWith({
      host: 'localhost',
      port: 6379,
    });
    expect(socket.setTimeout).toHaveBeenCalledWith(500);
  });

  it('waits for complete bulk replies before parsing the JSON payload', async () => {
    const cachedRoute = {
      vehicleId: 'v-002',
      route: { steps: [] },
    };
    const socket = new FakeRedisSocket([
      splitBulk(JSON.stringify(cachedRoute)),
    ]);
    createConnectionMock.mockReturnValueOnce(socket as unknown as net.Socket);
    const repository = new ActiveRouteRepository(
      configService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    const lookup = repository.findByVehicleId('v-002');
    socket.emit('connect');

    await expect(lookup).resolves.toEqual(cachedRoute);
  });

  it('ignores malformed or mismatched cache payloads', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const malformedSocket = new FakeRedisSocket([[bulk('{not-json')]]);
    createConnectionMock.mockReturnValueOnce(
      malformedSocket as unknown as net.Socket,
    );
    const malformedRepository = new ActiveRouteRepository(
      configService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    const malformedLookup = malformedRepository.findByVehicleId('v-001');
    malformedSocket.emit('connect');
    await expect(malformedLookup).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring malformed active route cache for v-001',
      ),
    );

    const mismatchedSocket = new FakeRedisSocket([
      [bulk(JSON.stringify({ vehicleId: 'other', route: { steps: [] } }))],
    ]);
    createConnectionMock.mockReturnValueOnce(
      mismatchedSocket as unknown as net.Socket,
    );
    const mismatchedRepository = new ActiveRouteRepository(
      configService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    const mismatchedLookup = mismatchedRepository.findByVehicleId('v-001');
    mismatchedSocket.emit('connect');
    await expect(mismatchedLookup).resolves.toBeNull();
  });

  it('returns null when Redis replies with a non-string value', async () => {
    const socket = new FakeRedisSocket([[integer(1)]]);
    createConnectionMock.mockReturnValueOnce(socket as unknown as net.Socket);
    const repository = new ActiveRouteRepository(
      configService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    const lookup = repository.findByVehicleId('v-001');
    socket.emit('connect');

    await expect(lookup).resolves.toBeNull();
  });

  it('propagates Redis protocol errors and still closes the socket', async () => {
    const socket = new FakeRedisSocket([[errorReply('ERR no route')]]);
    createConnectionMock.mockReturnValueOnce(socket as unknown as net.Socket);
    const repository = new ActiveRouteRepository(
      configService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    const lookup = repository.findByVehicleId('v-001');
    socket.emit('connect');

    await expect(lookup).rejects.toThrow('ERR no route');
    expect(socket.end).toHaveBeenCalledTimes(1);
  });

  it('rejects when the connection times out before Redis connects', async () => {
    const socket = new FakeRedisSocket([]);
    createConnectionMock.mockReturnValueOnce(socket as unknown as net.Socket);
    const repository = new ActiveRouteRepository(
      configService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    const lookup = repository.findByVehicleId('v-001');
    socket.emit('timeout');

    await expect(lookup).rejects.toThrow('Redis connection timed out');
    expect(socket.end).toHaveBeenCalledTimes(1);
  });
});
