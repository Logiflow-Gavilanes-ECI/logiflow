import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesRepository, VehicleRecord } from './vehicles.repository';

export type { VehicleRecord as VehicleEntity };

@Injectable()
export class VehiclesService {
  constructor(private readonly repo: VehiclesRepository) {}

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
}
