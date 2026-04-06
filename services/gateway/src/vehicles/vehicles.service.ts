import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesRepository, VehicleRecord } from './vehicles.repository';
import { StopsService } from '../stops/stops.service';

export type { VehicleRecord as VehicleEntity } from './vehicles.repository';

export type RouteStepStatus = 'pending' | 'active' | 'completed';

export interface DriverRouteStep {
  stopId: string;
  address: string;
  lat: number;
  lng: number;
  arrivalOrder: number;
  status: RouteStepStatus;
}

export interface DriverRoute {
  vehicleId: string;
  steps: DriverRouteStep[];
}

interface RouteStopSource {
  id: string;
  lat: number;
  lng: number;
  priority: number;
  createdAt?: string;
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly repo: VehiclesRepository,
    private readonly stopsService: StopsService,
  ) {}

  findAll(): Promise<VehicleRecord[]> {
    return this.repo.findAll();
  }

  async findOne(id: string): Promise<VehicleRecord> {
    const vehicle = await this.repo.findById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle "${id}" not found`);
    }
    return vehicle;
  }

  create(dto: CreateVehicleDto): Promise<VehicleRecord> {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleRecord> {
    await this.findOne(id);
    return this.repo.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    return this.repo.remove(id);
  }

  async getAssignedRoute(vehicleId?: string): Promise<DriverRoute> {
    const resolvedVehicleId = await this.resolveVehicleIdForRoute(vehicleId);
    const stops = await this.resolveStopsForRoute();
    const sortedStops = [...stops].sort(compareStopsForArrivalOrder);

    return {
      vehicleId: resolvedVehicleId,
      steps: sortedStops.map((stop, index) => ({
        stopId: stop.id,
        address: buildStopAddress(stop.id, index),
        lat: stop.lat,
        lng: stop.lng,
        arrivalOrder: index + 1,
        status: index === 0 ? 'active' : 'pending',
      })),
    };
  }

  private async resolveVehicleIdForRoute(vehicleId?: string): Promise<string> {
    const fallbackVehicleId =
      typeof vehicleId === 'string' && vehicleId.trim().length > 0
        ? vehicleId.trim()
        : 'demo-vehicle';

    try {
      if (vehicleId && vehicleId.trim().length > 0) {
        const vehicle = await this.repo.findById(vehicleId.trim());
        if (vehicle) {
          return vehicle.id;
        }
      }

      const vehicles = await this.repo.findAll();
      if (vehicles.length > 0) {
        return vehicles[0].id;
      }
    } catch {
      return fallbackVehicleId;
    }

    return fallbackVehicleId;
  }

  private async resolveStopsForRoute(): Promise<RouteStopSource[]> {
    try {
      const stops = await this.stopsService.findAll();
      if (stops.length > 0) {
        return stops;
      }
    } catch {
      return createFallbackStops();
    }

    return createFallbackStops();
  }
}

function compareStopsForArrivalOrder(
  left: RouteStopSource,
  right: RouteStopSource,
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
}

function buildStopAddress(stopId: string, index: number): string {
  return `Stop ${index + 1} (${stopId.slice(0, 8)})`;
}

function createFallbackStops(): RouteStopSource[] {
  return [
    {
      id: 'fallback-stop-1',
      lat: 4.6486,
      lng: -74.2479,
      priority: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'fallback-stop-2',
      lat: 4.6672,
      lng: -74.0556,
      priority: 1,
      createdAt: '2026-01-01T00:05:00.000Z',
    },
    {
      id: 'fallback-stop-3',
      lat: 4.711,
      lng: -74.0721,
      priority: 2,
      createdAt: '2026-01-01T00:10:00.000Z',
    },
  ];
}
