import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { Vehicle } from '@prisma/client';

export interface VehicleRecord {
  id: string;
  lat: number;
  lng: number;
  capacity: number;
  plate: string | null;
  model: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class VehiclesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<VehicleRecord[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return vehicles.map((vehicle) => this.toRecord(vehicle));
  }

  async findById(id: string): Promise<VehicleRecord | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });

    return vehicle ? this.toRecord(vehicle) : null;
  }

  async ensureExists(id: string): Promise<VehicleRecord> {
    const vehicle = await this.prisma.vehicle.upsert({
      where: { id },
      update: {},
      create: {
        id,
        lat: 4.711,
        lng: -74.0721,
        capacity: 1,
        status: 'online',
      },
    });

    return this.toRecord(vehicle);
  }

  async create(dto: CreateVehicleDto): Promise<VehicleRecord> {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        id: dto.id,
        lat: dto.lat,
        lng: dto.lng,
        capacity: dto.capacity,
        plate: dto.plate,
        model: dto.model,
        status: dto.status,
      },
    });

    return this.toRecord(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleRecord> {
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.plate !== undefined && { plate: dto.plate }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    return this.toRecord(vehicle);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.vehicle.delete({
      where: { id },
    });
  }

  private toRecord(vehicle: Vehicle): VehicleRecord {
    return {
      id: vehicle.id,
      lat: vehicle.lat,
      lng: vehicle.lng,
      capacity: vehicle.capacity,
      plate: vehicle.plate ?? null,
      model: vehicle.model ?? null,
      status: vehicle.status ?? 'online',
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }
}
