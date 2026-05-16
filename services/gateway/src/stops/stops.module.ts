import { Module } from '@nestjs/common';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';
import { StopsRepository } from './stops.repository';
import { SocketClientModule } from '../socket-client/socket-client.module';

@Module({
  imports: [SocketClientModule],
  controllers: [StopsController],
  providers: [StopsService, StopsRepository],
  exports: [StopsService, StopsRepository],
})
export class StopsModule {}
