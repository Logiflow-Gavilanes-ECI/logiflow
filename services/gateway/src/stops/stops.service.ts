import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { StopsRepository, StopRecord } from './stops.repository';

export type { StopRecord as StopEntity };

@Injectable()
export class StopsService {
  constructor(private readonly repo: StopsRepository) {}

  findAll(): Promise<StopRecord[]> {
    return this.repo.findAll();
  }

  async findOne(id: string): Promise<StopRecord> {
    const stop = await this.repo.findById(id);
    if (!stop) {
      throw new NotFoundException(`Stop "${id}" not found`);
    }
    return stop;
  }

  create(dto: CreateStopDto): Promise<StopRecord> {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateStopDto): Promise<StopRecord> {
    await this.findOne(id);
    return this.repo.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    return this.repo.remove(id);
  }
}
