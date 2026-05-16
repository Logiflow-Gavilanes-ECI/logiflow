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
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildVehicleProfileDefaults } from '../vehicles/vehicle-profile.defaults';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly grpcClient: GrpcClientService,
    private readonly socketClient: SocketClientService,
    private readonly retryService: RetryService,
    private readonly notificationsService: NotificationsService,
    private readonly prismaService: PrismaService,
  ) {}

  async handleEvent(event: WebhookEventDto, correlationId?: string) {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;
    const jobsCount = event.jobs?.length ?? event.stops?.length ?? 0;
    const shipmentsCount = event.shipments?.length ?? 0;

    this.logger.log(
      `Received event: ${event.eventType} | vehicles: ${event.vehicles.length} | jobs: ${jobsCount} | shipments: ${shipmentsCount} | correlationId: ${effectiveCorrelationId}`,
    );

    const grpcRequest = this.buildOptimizeRequest(event);
    await this.persistIncomingFleetSnapshot(event, effectiveCorrelationId);

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

    optimizedRoutes = this.attachRouteStepAddresses(optimizedRoutes, event);

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

    try {
      const vehicleIds = event.vehicles.map((v) => v.id);
      const stopsCount = event.stops?.length ?? 0;
      for (const vehicleId of vehicleIds) {
        await this.notificationsService.sendRouteUpdate(vehicleId, vehicleIds, {
          stops: stopsCount,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Push notification failed | correlationId: ${effectiveCorrelationId}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      received: true,
      eventType: event.eventType,
      vehicleCount: event.vehicles.length,
      stopCount: event.stops?.length ?? 0,
      jobCount: grpcRequest.jobs.length,
      shipmentCount: grpcRequest.shipments.length,
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
      address: job.address,
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
      address: stop.address,
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

    if (jobs.length === 0 && shipments.length === 0) {
      throw new BadRequestException(
        'The webhook payload must include at least one job, one legacy stop, or one shipment.',
      );
    }

    const request: OptimizeRequest = {
      vehicles,
      jobs,
      shipments,
      departureTime: event.departureTime,
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
            address: job.address,
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

  private async persistIncomingFleetSnapshot(
    event: WebhookEventDto,
    correlationId: string,
  ): Promise<void> {
    try {
      await Promise.all([
        ...event.vehicles.map((vehicle) => {
          const lat = vehicle.lat ?? vehicle.start?.lat ?? 4.711;
          const lng = vehicle.lng ?? vehicle.start?.lon ?? -74.0721;
          const defaults = buildVehicleProfileDefaults(vehicle.id);

          return this.prismaService.vehicle.upsert({
            where: { id: vehicle.id },
            update: {
              lat,
              lng,
              capacity: vehicle.capacity,
              status: 'online',
            },
            create: {
              id: vehicle.id,
              lat,
              lng,
              capacity: vehicle.capacity,
              plate: defaults.plate,
              model: defaults.model,
              status: defaults.status,
            },
          });
        }),
        ...(event.stops ?? []).map((stop) =>
          this.prismaService.stop.upsert({
            where: { id: stop.id },
            update: {
              address: stop.address?.trim() || undefined,
              lat: stop.lat,
              lng: stop.lng,
              demand: stop.demand,
              priority: stop.priority ?? 0,
            },
            create: {
              id: stop.id,
              address: stop.address?.trim() || undefined,
              lat: stop.lat,
              lng: stop.lng,
              demand: stop.demand,
              priority: stop.priority ?? 0,
            },
          }),
        ),
      ]);
    } catch (error) {
      this.logger.warn(
        `Could not persist incoming fleet snapshot | correlationId: ${correlationId}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private attachRouteStepAddresses(
    response: OptimizeResponse,
    event: WebhookEventDto,
  ): OptimizeResponse {
    const addressByStopId = new Map<string, string>();

    for (const stop of event.stops ?? []) {
      if (stop.address?.trim()) {
        addressByStopId.set(stop.id, stop.address.trim());
      }
    }

    for (const job of event.jobs ?? []) {
      if (job.address?.trim()) {
        addressByStopId.set(job.id, job.address.trim());
      }
    }

    if (addressByStopId.size === 0) {
      return response;
    }

    return {
      ...response,
      routes: (response.routes ?? []).map((route) => ({
        ...route,
        steps: (route.steps ?? []).map((step) => ({
          ...step,
          address: step.address ?? addressByStopId.get(step.id),
        })),
      })),
    };
  }
}
