import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { io, Socket } from 'socket.io-client';
import { SolveRouteResponse } from '../grpc-client/interfaces/route-optimizer.interface';
import { UNKNOWN_CORRELATION_ID } from '../common/constants/correlation-id.constant';

@Injectable()
export class SocketClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocketClientService.name);
  private socket!: Socket;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>(
      'SOCKETIO_SERVER_HOST',
      'localhost',
    );
    const port = this.configService.get<string>('SOCKETIO_SERVER_PORT', '3001');
    const url = `http://${host}:${port}`;

    this.socket = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.logger.log(`Connected to Socket.io server at ${url}`);
    });

    this.socket.on('disconnect', (reason: string) => {
      this.connected = false;
      this.logger.warn(`Disconnected from Socket.io server: ${reason}`);
    });

    this.socket.on('connect_error', (error: Error) => {
      this.connected = false;
      this.logger.warn(
        `Socket.io connection error: ${error.message}. Will retry automatically.`,
      );
    });
  }

  onModuleDestroy() {
    if (this.socket) {
      this.socket.disconnect();
      this.logger.log('Socket.io client disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  emitRouteUpdate(
    eventType: string,
    routes: SolveRouteResponse,
    correlationId?: string,
  ): void {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;

    const payload = {
      eventType,
      correlationId: effectiveCorrelationId,
      routes: routes.routes,
      totalCost: routes.totalCost,
      solvedAt: routes.solvedAt,
      emittedAt: new Date().toISOString(),
    };

    if (this.connected) {
      this.socket.emit('route-update', payload);
      this.logger.log(
        `Emitted route-update: ${routes.routes.length} routes for event ${eventType} | correlationId: ${effectiveCorrelationId}`,
      );
    } else {
      throw new Error(
        `Socket.io server not connected, route update not emitted | correlationId: ${effectiveCorrelationId}`,
      );
    }
  }
}
