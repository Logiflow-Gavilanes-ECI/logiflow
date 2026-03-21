import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { SocketClientService } from '../socket-client/socket-client.service';
import {
  Job,
  OptimizeRequest,
  OptimizeResponse,
  Profile,
  Shipment,
  Vehicle,
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
    const jobsCount = event.jobs?.length ?? event.stops?.length ?? 0;

    this.logger.log(
      `Received event: ${event.eventType} | vehicles: ${event.vehicles.length} | jobs: ${jobsCount} | correlationId: ${effectiveCorrelationId}`,
    );

    const grpcRequest = this.buildOptimizeRequest(event);

    let optimizedRoutes: OptimizeResponse;
    let optimizerFailed = false;

    try {
      optimizedRoutes = await this.retryService.execute(
        () =>
          this.grpcClient.optimizeRoutes(grpcRequest, effectiveCorrelationId),
        {
          correlationId: effectiveCorrelationId,
          operationName: 'grpc.optimizeRoutes',
        },
        DEFAULT_RETRY_OPTIONS,
      );
      this.logger.log(
        `Optimizer returned routes successfully | correlationId: ${effectiveCorrelationId}`,
      );
    } catch (error) {
      if (error instanceof RetryExhaustedException) {
        this.logger.error(
          `[grpc.optimizeRoutes] exhausted ${error.attempts} attempt(s), activating fallback | ` +
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
      stopCount: event.stops?.length ?? 0,
      jobCount: grpcRequest.jobs.length,
      correlationId: effectiveCorrelationId,
      optimizedRoutes,
      fallback: optimizerFailed,
      fallbackReason: optimizerFailed ? 'optimizer-unreachable' : undefined,
      socketConnected: this.socketClient.isConnected(),
      timestamp: new Date().toISOString(),
    };
  }

  private buildOptimizeRequest(event: WebhookEventDto): OptimizeRequest {
    const vehicles = event.vehicles.map((vehicle): Vehicle => {
      const start =
        vehicle.start ??
        (vehicle.lat !== undefined && vehicle.lng !== undefined
          ? { lat: vehicle.lat, lon: vehicle.lng }
          : undefined);

      return {
        id: vehicle.id,
        profile: (vehicle.profile ?? Profile.CAR) as Profile,
        start,
        end: vehicle.end,
        capacity: vehicle.capacity,
        skills: vehicle.skills ?? [],
        timeWindowStart: vehicle.timeWindowStart ?? 0,
        timeWindowEnd: vehicle.timeWindowEnd ?? 4294967295,
        restrictions: vehicle.restrictions ?? [],
      };
    });

    const jobsFromPayload: Job[] = (event.jobs ?? []).map((job) => ({
      id: job.id,
      location: {
        lat: job.location.lat,
        lon: job.location.lon,
      },
      service: job.service ?? 0,
      amount: job.amount ?? 0,
      timeWindowStart: job.timeWindowStart ?? 0,
      timeWindowEnd: job.timeWindowEnd ?? 4294967295,
      skills: job.skills ?? [],
      priority: job.priority ?? 0,
    }));

    const jobsFromLegacyStops: Job[] = (event.stops ?? []).map((stop) => ({
      id: stop.id,
      location: {
        lat: stop.lat,
        lon: stop.lng,
      },
      service: 0,
      amount: stop.demand,
      timeWindowStart: 0,
      timeWindowEnd: 4294967295,
      skills: [],
      priority: stop.priority ?? 0,
    }));

    const jobs =
      jobsFromPayload.length > 0 ? jobsFromPayload : jobsFromLegacyStops;

    if (jobs.length === 0) {
      throw new BadRequestException(
        'The webhook payload must include at least one job or one legacy stop.',
      );
    }

    const shipments: Shipment[] = (event.shipments ?? []).map((shipment) => ({
      id: shipment.id,
      pickup: {
        id: shipment.pickup.id,
        location: {
          lat: shipment.pickup.location.lat,
          lon: shipment.pickup.location.lon,
        },
        service: shipment.pickup.service ?? 0,
        amount: shipment.pickup.amount ?? 0,
        timeWindowStart: shipment.pickup.timeWindowStart ?? 0,
        timeWindowEnd: shipment.pickup.timeWindowEnd ?? 4294967295,
        restrictions: shipment.pickup.restrictions ?? [],
        skills: shipment.pickup.skills ?? [],
      },
      delivery: {
        id: shipment.delivery.id,
        location: {
          lat: shipment.delivery.location.lat,
          lon: shipment.delivery.location.lon,
        },
        service: shipment.delivery.service ?? 0,
        amount: shipment.delivery.amount ?? 0,
        timeWindowStart: shipment.delivery.timeWindowStart ?? 0,
        timeWindowEnd: shipment.delivery.timeWindowEnd ?? 4294967295,
        restrictions: shipment.delivery.restrictions ?? [],
        skills: shipment.delivery.skills ?? [],
      },
      skills: shipment.skills ?? [],
      priority: shipment.priority ?? 0,
    }));

    const request: OptimizeRequest = {
      vehicles,
      jobs,
      shipments,
      options: {
        geometry: event.options?.geometry ?? false,
        metric: event.options?.metric ?? 'duration',
        optimize: event.options?.optimize ?? true,
        algorithm: event.options?.algorithm ?? 'greedy',
        maxJobsPerRoute: event.options?.maxJobsPerRoute ?? 0,
      },
    };

    if (event.matrix) {
      request.matrix = {
        distances: event.matrix.distances ?? [],
        durations: event.matrix.durations ?? [],
        locations: (event.matrix.locations ?? []).map((location) => ({
          lat: location.lat,
          lon: location.lon,
        })),
      };
    }

    return request;
  }

  private buildMockResponse(request: OptimizeRequest): OptimizeResponse {
    return {
      code: 0,
      error: '',
      routes: request.vehicles.map((vehicle, vi) => ({
        vehicleId: vehicle.id,
        cost: Math.floor(Math.random() * 100),
        distance: Math.floor(Math.random() * 50000 + 10000),
        duration: Math.floor(Math.random() * 3600 + 900),
        steps: request.jobs
          .filter((_, si) => si % request.vehicles.length === vi)
          .map((job, order) => ({
            type: 'job',
            id: job.id,
            location: {
              lat: job.location.lat,
              lon: job.location.lon,
            },
            service: job.service,
            waitingTime: 0,
            arrival: order + 1,
            departure: order + 1,
            amount: job.amount,
            skills: job.skills,
          })),
        delivery: 0,
        pickup: 0,
      })),
      unassigned: [],
      routingDistance: Math.floor(Math.random() * 50000 + 10000),
      routingDuration: Math.floor(Math.random() * 3600 + 900),
    };
  }
}
