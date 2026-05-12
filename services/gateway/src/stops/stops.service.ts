import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { StopsRepository, StopRecord } from './stops.repository';
import { SocketClientService } from '../socket-client/socket-client.service';

export type { StopRecord as StopEntity };

@Injectable()
export class StopsService {
  private readonly logger = new Logger(StopsService.name);

  constructor(
    private readonly repo: StopsRepository,
    @Optional() private readonly socketClient?: SocketClientService,
  ) {}

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

  async complete(id: string): Promise<StopRecord> {
    const stop = await this.findOne(id);
    if (stop.completedAt) {
      return stop;
    }

    const updated = await this.repo.markCompleted(id);

    try {
      this.socketClient?.emitStopCompleted({
        stopId: updated.id,
        completedAt: updated.completedAt!,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to broadcast stop:completed for ${id}: ${message}`,
      );
    }

    return updated;
  }
}
