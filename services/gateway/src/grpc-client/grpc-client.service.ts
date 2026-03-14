import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import {
  RouteOptimizerGrpcService,
  SolveRouteRequest,
  SolveRouteResponse,
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

  async solveRoute(
    request: SolveRouteRequest,
    correlationId?: string,
  ): Promise<SolveRouteResponse> {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;

    this.logger.log(
      `Sending VRP to optimizer: ${request.vehicles.length} vehicles, ${request.stops.length} stops | correlationId: ${effectiveCorrelationId}`,
    );

    const metadata = new Metadata();
    metadata.add(CORRELATION_ID_HEADER, effectiveCorrelationId);
    const result = (
      this.routeOptimizerService.solveRoute as unknown as (
        payload: SolveRouteRequest,
        md: Metadata,
      ) => Observable<SolveRouteResponse>
    )(request, metadata);

    // gRPC in NestJS returns Observable; convert to Promise
    const response = await firstValueFrom(
      result as unknown as Observable<SolveRouteResponse>,
    );

    this.logger.log(
      `Optimizer returned ${response.routes.length} routes, total cost: ${response.totalCost} | correlationId: ${effectiveCorrelationId}`,
    );

    return response;
  }
}
