import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Stop } from '@prisma/client';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';

export interface StopRecord {
  id: string;
  lat: number;
  lng: number;
  demand: number;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class StopsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<StopRecord[]> {
    const stops = await this.prisma.stop.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return stops.map((stop) => this.toRecord(stop));
  }

  async findById(id: string): Promise<StopRecord | null> {
    const stop = await this.prisma.stop.findUnique({
      where: { id },
    });

    return stop ? this.toRecord(stop) : null;
  }

  async create(dto: CreateStopDto): Promise<StopRecord> {
    const stop = await this.prisma.stop.create({
      data: {
        id: dto.id,
        lat: dto.lat,
        lng: dto.lng,
        demand: dto.demand,
        priority: dto.priority,
      },
    });

    return this.toRecord(stop);
  }

  async update(id: string, dto: UpdateStopDto): Promise<StopRecord> {
    const stop = await this.prisma.stop.update({
      where: { id },
      data: {
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.demand !== undefined && { demand: dto.demand }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });

    return this.toRecord(stop);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.stop.delete({
      where: { id },
    });
  }

  private toRecord(stop: Stop): StopRecord {
    return {
      id: stop.id,
      lat: stop.lat,
      lng: stop.lng,
      demand: stop.demand,
      priority: stop.priority,
      createdAt: stop.createdAt.toISOString(),
      updatedAt: stop.updatedAt.toISOString(),
    };
  }
}
