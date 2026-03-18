import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import {
  RouteOptimizerGrpcService,
  OptimizeRequest,
  OptimizeResponse,
} from './interfaces/route-optimizer.interface';
import { firstValueFrom, Observable } from 'rxjs';
import {
  CORRELATION_ID_HEADER,
  UNKNOWN_CORRELATION_ID,
} from '../common/constants/correlation-id.constant';

@Injectable()
export class GrpcClientService implements OnModuleInit {
  private readonly logger = new Logger(GrpcClientService.name);
  private routeOptimizerService!: RouteOptimizerGrpcService;

  constructor(
    @Inject('ROUTE_OPTIMIZER_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.routeOptimizerService =
      this.client.getService<RouteOptimizerGrpcService>('RouteOptimizer');
    this.logger.log('gRPC RouteOptimizer client initialized');
  }

  async optimizeRoutes(
    request: OptimizeRequest,
    correlationId?: string,
  ): Promise<OptimizeResponse> {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;

    this.logger.log(
      `Sending VRP to optimizer: ${request.vehicles.length} vehicles, ${request.jobs.length} jobs, ${request.shipments.length} shipments | correlationId: ${effectiveCorrelationId}`,
    );

    const metadata = new Metadata();
    metadata.add(CORRELATION_ID_HEADER, effectiveCorrelationId);
    const result = (
      this.routeOptimizerService.optimizeRoutes as unknown as (
        payload: OptimizeRequest,
        md: Metadata,
      ) => Observable<OptimizeResponse>
    )(request, metadata);

    // gRPC in NestJS returns Observable; convert to Promise
    const response = await firstValueFrom(
      result as unknown as Observable<OptimizeResponse>,
    );

    this.logger.log(
      `Optimizer returned ${response.routes.length} routes, code: ${response.code} | correlationId: ${effectiveCorrelationId}`,
    );

    return response;
  }
}
