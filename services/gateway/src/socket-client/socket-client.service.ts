import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { io, Socket } from 'socket.io-client';
import {
  OptimizeResponse,
  Route,
  RouteStep,
} from '../grpc-client/interfaces/route-optimizer.interface';
import { UNKNOWN_CORRELATION_ID } from '../common/constants/correlation-id.constant';

interface InternalRouteStep {
  id: string;
  stopId: string;
  lat: number;
  lng: number;
  lon: number;
  type: string;
  arrivalOrder: number;
}

interface InternalRoute {
  vehicleId: string;
  steps: InternalRouteStep[];
  totalDistance: number;
  estimatedTime: number;
  distance: string | number;
  duration: string | number;
  cost: number;
}

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
    routes: OptimizeResponse,
    correlationId?: string,
  ): void {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;
    const sourceRoutes = routes.routes ?? [];
    const normalizedRoutes = this.mapRoutesToInternalFormat(sourceRoutes);

    const payload = {
      eventType,
      correlationId: effectiveCorrelationId,
      routes: normalizedRoutes,
      code: routes.code,
      error: routes.error,
      routingDistance: routes.routingDistance,
      routingDuration: routes.routingDuration,
      emittedAt: new Date().toISOString(),
    };

    if (this.connected) {
      this.socket.emit('route-update', payload);
      this.logger.log(
        `Emitted route-update: ${sourceRoutes.length} routes for event ${eventType} | correlationId: ${effectiveCorrelationId}`,
      );
    } else {
      throw new Error(
        `Socket.io server not connected, route update not emitted | correlationId: ${effectiveCorrelationId}`,
      );
    }
  }

  private mapRoutesToInternalFormat(routes: Route[]): InternalRoute[] {
    return routes.map((route) => ({
      vehicleId: route.vehicleId,
      steps: (route.steps ?? []).map((step, index) =>
        this.mapStepToInternalFormat(step, index),
      ),
      totalDistance: Number(route.distance || 0),
      estimatedTime: Number(route.duration || 0),
      distance: route.distance,
      duration: route.duration,
      cost: route.cost,
    }));
  }

  private mapStepToInternalFormat(step: RouteStep, index: number): InternalRouteStep {
    return {
      id: step.id,
      stopId: step.id,
      lat: step.location.lat,
      lng: step.location.lon,
      lon: step.location.lon,
      type: step.type,
      arrivalOrder: step.arrival || index + 1,
    };
  }
}
