import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'node:net';

export interface ActiveRouteStep {
  type?: string;
  id?: string;
  location?: {
    lat?: number;
    lon?: number;
    lng?: number;
  };
  arrival?: number | string;
}

export interface ActiveRouteSnapshot {
  vehicleId: string;
  route: {
    steps?: ActiveRouteStep[];
  };
  correlationId?: string;
  persistedAt?: string;
}

interface ParsedRedisUrl {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: string;
}

type RespValue = string | number | null;

@Injectable()
export class ActiveRouteRepository {
  private readonly logger = new Logger(ActiveRouteRepository.name);

  constructor(private readonly configService: ConfigService) {}

  async findByVehicleId(
    vehicleId: string,
  ): Promise<ActiveRouteSnapshot | null> {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) return null;

    const key = `route:vehicle:${vehicleId}`;
    const raw = await this.get(redisUrl, key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as ActiveRouteSnapshot;
      if (!parsed?.route || parsed.vehicleId !== vehicleId) return null;
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Ignoring malformed active route cache for ${vehicleId}: ${messageFor(error)}`,
      );
      return null;
    }
  }

  private async get(redisUrl: string, key: string): Promise<string | null> {
    const parsed = parseRedisUrl(redisUrl);
    const timeoutMs = parsePositiveInt(
      this.configService.get<string>('REDIS_ROUTE_READ_TIMEOUT_MS'),
      500,
    );

    const socket = net.createConnection({
      host: parsed.host,
      port: parsed.port,
    });

    socket.setTimeout(timeoutMs);

    try {
      await waitForConnect(socket);

      if (parsed.password) {
        const authArgs = parsed.username
          ? ['AUTH', parsed.username, parsed.password]
          : ['AUTH', parsed.password];
        await sendCommand(socket, authArgs);
      }

      if (parsed.db) {
        await sendCommand(socket, ['SELECT', parsed.db]);
      }

      const value = await sendCommand(socket, ['GET', key]);
      return typeof value === 'string' ? value : null;
    } finally {
      socket.end();
    }
  }
}

function parseRedisUrl(rawUrl: string): ParsedRedisUrl {
  const url = new URL(rawUrl);
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db:
      url.pathname && url.pathname !== '/' ? url.pathname.slice(1) : undefined,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function waitForConnect(socket: net.Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('Redis connection timed out'));
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

function sendCommand(socket: net.Socket, args: string[]): Promise<RespValue> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = parseResp(buffer);
      if (!parsed.complete) return;

      cleanup();
      if (parsed.error) {
        reject(parsed.error);
      } else {
        resolve(parsed.value);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('Redis command timed out'));
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.write(encodeCommand(args));
  });
}

function encodeCommand(args: string[]): string {
  return [
    `*${args.length}`,
    ...args.flatMap((arg) => [`$${Buffer.byteLength(arg)}`, arg]),
    '',
  ].join('\r\n');
}

function parseResp(
  buffer: Buffer,
):
  | { complete: false }
  | { complete: true; value: RespValue; error?: undefined }
  | { complete: true; value?: undefined; error: Error } {
  const type = buffer.toString('utf8', 0, 1);
  const lineEnd = buffer.indexOf('\r\n');
  if (lineEnd < 0) return { complete: false };

  const line = buffer.toString('utf8', 1, lineEnd);
  if (type === '+') return { complete: true, value: line };
  if (type === '-') return { complete: true, error: new Error(line) };
  if (type === ':') return { complete: true, value: Number(line) };

  if (type !== '$') {
    return {
      complete: true,
      error: new Error(`Unsupported Redis reply: ${type}`),
    };
  }

  const length = Number(line);
  if (length === -1) return { complete: true, value: null };
  if (!Number.isFinite(length) || length < 0) {
    return { complete: true, error: new Error('Invalid Redis bulk string') };
  }

  const valueStart = lineEnd + 2;
  const valueEnd = valueStart + length;
  const replyEnd = valueEnd + 2;
  if (buffer.length < replyEnd) return { complete: false };

  return {
    complete: true,
    value: buffer.toString('utf8', valueStart, valueEnd),
  };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
