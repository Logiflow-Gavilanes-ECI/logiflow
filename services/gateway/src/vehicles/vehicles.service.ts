import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesRepository, VehicleRecord } from './vehicles.repository';
import { StopsService } from '../stops/stops.service';
import {
  buildVehicleModel,
  buildVehiclePlate,
} from './vehicle-profile.defaults';
import {
  ActiveRouteRepository,
  ActiveRouteStep,
} from './active-route.repository';

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

export interface VehicleDetails {
  id: string;
  plate: string;
  model: string;
  status: string;
  lat: number;
  lng: number;
  capacity: number;
}

interface RouteStopSource {
  id: string;
  address?: string | null;
  lat: number;
  lng: number;
  priority: number;
  completedAt?: string | null;
  createdAt?: string;
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly repo: VehiclesRepository,
    private readonly stopsService: StopsService,
    private readonly activeRouteRepository: ActiveRouteRepository,
  ) {}

  findAll(): Promise<VehicleRecord[]> {
    return this.repo.findAll();
  }

  async findOne(id: string): Promise<VehicleDetails> {
    return this.findDetails(id);
  }

  async findDetails(id: string): Promise<VehicleDetails> {
    const trimmedId = id.trim();
    if (!trimmedId) {
      throw new NotFoundException(`Vehicle "${id}" not found`);
    }

    const vehicle =
      (await this.repo.findById(trimmedId)) ??
      (await this.repo.ensureExists(trimmedId));
    return toVehicleDetails(vehicle);
  }

  create(dto: CreateVehicleDto): Promise<VehicleRecord> {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleRecord> {
    await this.assertExists(id);
    return this.repo.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    return this.repo.remove(id);
  }

  async getAssignedRoute(vehicleId?: string): Promise<DriverRoute> {
    const resolvedVehicleId = await this.resolveVehicleIdForRoute(vehicleId);
    const activeRoute = await this.resolveActiveRoute(resolvedVehicleId);
    if (activeRoute) {
      return activeRoute;
    }

    return {
      vehicleId: resolvedVehicleId,
      steps: [],
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

  private async resolveActiveRoute(vehicleId: string): Promise<DriverRoute | null> {
    try {
      const activeRoute =
        await this.activeRouteRepository.findByVehicleId(vehicleId);
      const steps = activeRoute?.route?.steps;
      if (!Array.isArray(steps)) return null;

      const stopMetadata = await this.resolveStopMetadataById();
      const routeStops = steps
        .filter(isRouteJobStep)
        .map((step) => toRouteStopSource(step, stopMetadata))
        .filter((stop): stop is RouteStopSource => Boolean(stop))
        .filter((stop) => !stop.completedAt);

      return {
        vehicleId,
        steps: routeStops.map((stop, index) => ({
          stopId: stop.id,
          address: resolveStopAddress(stop, index),
          lat: stop.lat,
          lng: stop.lng,
          arrivalOrder: index + 1,
          status: index === 0 ? 'active' : 'pending',
        })),
      };
    } catch {
      return null;
    }
  }

  private async resolveStopMetadataById(): Promise<Map<string, RouteStopSource>> {
    try {
      const stops = await this.stopsService.findAll();
      return new Map(stops.map((stop) => [stop.id, stop]));
    } catch {
      return new Map();
    }
  }

  private async assertExists(id: string): Promise<VehicleRecord> {
    const vehicle = await this.repo.findById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle "${id}" not found`);
    }
    return vehicle;
  }
}

function isRouteJobStep(step: ActiveRouteStep): boolean {
  const stepType = step.type?.trim().toLowerCase();
  const stepId = step.id?.trim();
  return stepType === 'job' && Boolean(stepId);
}

function toRouteStopSource(
  step: ActiveRouteStep,
  stopMetadata: Map<string, RouteStopSource>,
): RouteStopSource | null {
  const id = step.id?.trim();
  if (!id) return null;

  const lat = Number(step.location?.lat);
  const lng = Number(step.location?.lon ?? step.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const metadata = stopMetadata.get(id);
  return {
    id,
    address: metadata?.address ?? null,
    lat,
    lng,
    priority: metadata?.priority ?? Number(step.arrival ?? 0),
    completedAt: metadata?.completedAt ?? null,
    createdAt: metadata?.createdAt,
  };
}

function resolveStopAddress(stop: RouteStopSource, index: number): string {
  const address = stop.address?.trim();
  if (address) {
    return address;
  }

  return buildDemoStopAddress(index);
}

function buildDemoStopAddress(index: number): string {
  const demoAddresses = [
    'Cra 7 #45-12, Bogotá',
    'Calle 72 #10-34, Bogotá',
    'Av. Caracas #26-85, Bogotá',
    'Carrera 15 #93-47, Bogotá',
    'Calle 100 #19-61, Bogotá',
  ];

  return demoAddresses[index % demoAddresses.length];
}

function toVehicleDetails(vehicle: VehicleRecord): VehicleDetails {
  return {
    id: vehicle.id,
    plate: vehicle.plate?.trim() || buildVehiclePlate(vehicle.id),
    model: vehicle.model?.trim() || buildVehicleModel(vehicle.id),
    status: vehicle.status?.trim() || 'online',
    lat: vehicle.lat,
    lng: vehicle.lng,
    capacity: vehicle.capacity,
  };
}
