import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { SocketClientService } from '../socket-client/socket-client.service';
import {
  SolveRouteRequest,
  SolveRouteResponse,
} from '../grpc-client/interfaces/route-optimizer.interface';
import { UNKNOWN_CORRELATION_ID } from '../common/constants/correlation-id.constant';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly grpcClient: GrpcClientService,
    private readonly socketClient: SocketClientService,
  ) {}

  async handleEvent(event: WebhookEventDto, correlationId?: string) {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;

    this.logger.log(
      `Received event: ${event.eventType} | vehicles: ${event.vehicles.length} | stops: ${event.stops.length} | correlationId: ${effectiveCorrelationId}`,
    );

    const grpcRequest: SolveRouteRequest = {
      eventType: event.eventType,
      vehicles: event.vehicles.map((v) => ({
        id: v.id,
        lat: v.lat,
        lng: v.lng,
        capacity: v.capacity,
      })),
      stops: event.stops.map((s) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        demand: s.demand,
        priority: s.priority ?? 0,
      })),
    };

    let optimizedRoutes: SolveRouteResponse;

    try {
      optimizedRoutes = await this.grpcClient.solveRoute(
        grpcRequest,
        effectiveCorrelationId,
      );
      this.logger.log(
        `Optimizer returned routes successfully | correlationId: ${effectiveCorrelationId}`,
      );
    } catch (error) {
      this.logger.warn(
        `gRPC optimizer unavailable, using mock response | correlationId: ${effectiveCorrelationId}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      optimizedRoutes = this.buildMockResponse(grpcRequest);
    }

    this.socketClient.emitRouteUpdate(
      event.eventType,
      optimizedRoutes,
      effectiveCorrelationId,
    );

    return {
      received: true,
      eventType: event.eventType,
      vehicleCount: event.vehicles.length,
      stopCount: event.stops.length,
      correlationId: effectiveCorrelationId,
      optimizedRoutes,
      socketConnected: this.socketClient.isConnected(),
      timestamp: new Date().toISOString(),
    };
  }

  private buildMockResponse(request: SolveRouteRequest): SolveRouteResponse {
    return {
      routes: request.vehicles.map((vehicle, vi) => ({
        vehicleId: vehicle.id,
        steps: request.stops
          .filter((_, si) => si % request.vehicles.length === vi)
          .map((stop, order) => ({
            stopId: stop.id,
            lat: stop.lat,
            lng: stop.lng,
            arrivalOrder: order + 1,
          })),
        totalDistance: Math.random() * 50 + 10,
        estimatedTime: Math.random() * 60 + 15,
      })),
      totalCost: Math.random() * 200 + 50,
      solvedAt: new Date().toISOString(),
    };
  }
}
