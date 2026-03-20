export type Int64Value = string | number;

import type { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';

export enum Profile {
  CAR = 0,
  BICYCLE = 1,
  FOOT = 2,
}

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface Vehicle {
  id: string;
  profile: Profile;
  start?: Coordinate;
  end?: Coordinate;
  capacity: number;
  skills: number[];
  timeWindowStart: number;
  timeWindowEnd: number;
  restrictions: string[];
}

export interface Job {
  id: string;
  location: Coordinate;
  service: number;
  amount: number;
  timeWindowStart: number;
  timeWindowEnd: number;
  skills: number[];
  priority: number;
}

export interface Task {
  id: string;
  location: Coordinate;
  service: number;
  amount: number;
  timeWindowStart: number;
  timeWindowEnd: number;
  restrictions: string[];
  skills: number[];
}

export interface Shipment {
  id: string;
  pickup: Task;
  delivery: Task;
  skills: number[];
  priority: number;
}

export interface Matrix {
  distances: Int64Value[];
  durations: Int64Value[];
  locations: Coordinate[];
}

export interface Options {
  geometry: boolean;
  metric: string;
  optimize: boolean;
  algorithm: string;
  maxJobsPerRoute: number;
}

export interface OptimizeRequest {
  vehicles: Vehicle[];
  jobs: Job[];
  shipments: Shipment[];
  matrix?: Matrix;
  options?: Options;
}

export interface RouteStep {
  type: string;
  id: string;
  location: Coordinate;
  service: number;
  waitingTime: number;
  arrival: number;
  departure: number;
  amount: number;
  skills: number[];
}

export interface Route {
  vehicleId: string;
  cost: number;
  distance: Int64Value;
  duration: Int64Value;
  steps: RouteStep[];
  delivery: number;
  pickup: number;
}

export interface SolutionStep {
  type: string;
  id: string;
  location: Coordinate;
  service: number;
}

export interface SolutionRoute {
  id: string;
  vehicleId: string;
  steps: SolutionStep[];
}

export interface OptimizeResponse {
  code: Int64Value;
  error: string;
  routes: Route[];
  unassigned: SolutionRoute[];
  matrix?: Matrix;
  routingDistance: Int64Value;
  routingDuration: Int64Value;
}

export interface RouteOptimizerGrpcService {
  optimizeRoutes(
    request: OptimizeRequest,
    metadata: Metadata,
  ): Observable<OptimizeResponse>;
}
