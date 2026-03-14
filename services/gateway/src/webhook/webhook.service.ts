import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { SocketClientService } from '../socket-client/socket-client.service';
import {
  SolveRouteRequest,
  SolveRouteResponse,
} from '../grpc-client/interfaces/route-optimizer.interface';
import { UNKNOWN_CORRELATION_ID } from '../common/constants/correlation-id.constant';
import { RetryService } from '../common/retry/retry.service';
import {
  DEFAULT_RETRY_OPTIONS,
  SOCKET_RETRY_OPTIONS,
} from '../common/retry/retry.options';
import { RetryExhaustedException } from '../common/retry/retry-exhausted.exception';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly grpcClient: GrpcClientService,
    private readonly socketClient: SocketClientService,
    private readonly retryService: RetryService,
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
    let optimizerFailed = false;

    try {
      optimizedRoutes = await this.retryService.execute(
        () => this.grpcClient.solveRoute(grpcRequest, effectiveCorrelationId),
        {
          correlationId: effectiveCorrelationId,
          operationName: 'grpc.solveRoute',
        },
        DEFAULT_RETRY_OPTIONS,
      );
      this.logger.log(
        `Optimizer returned routes successfully | correlationId: ${effectiveCorrelationId}`,
      );
    } catch (error) {
      if (error instanceof RetryExhaustedException) {
        this.logger.error(
          `[grpc.solveRoute] exhausted ${error.attempts} attempt(s), activating fallback | ` +
            `correlationId: ${effectiveCorrelationId} | lastError: ${error.lastErrorMessage}`,
        );
      } else {
        this.logger.warn(
          `gRPC optimizer unavailable, activating fallback | correlationId: ${effectiveCorrelationId}. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      optimizerFailed = true;
      optimizedRoutes = this.buildMockResponse(grpcRequest);
    }

    try {
      await this.retryService.execute(
        () => {
          this.socketClient.emitRouteUpdate(
            event.eventType,
            optimizedRoutes,
            effectiveCorrelationId,
          );
          return Promise.resolve();
        },
        {
          correlationId: effectiveCorrelationId,
          operationName: 'socket.emitRouteUpdate',
        },
        SOCKET_RETRY_OPTIONS,
      );
    } catch (error) {
      if (error instanceof RetryExhaustedException) {
        this.logger.error(
          `[socket.emitRouteUpdate] exhausted ${error.attempts} attempt(s) | ` +
            `correlationId: ${effectiveCorrelationId} | lastError: ${error.lastErrorMessage}`,
        );
      } else {
        this.logger.warn(
          `Socket emit failed | correlationId: ${effectiveCorrelationId}. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      received: true,
      eventType: event.eventType,
      vehicleCount: event.vehicles.length,
      stopCount: event.stops.length,
      correlationId: effectiveCorrelationId,
      optimizedRoutes,
      fallback: optimizerFailed,
      fallbackReason: optimizerFailed ? 'optimizer-unreachable' : undefined,
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
