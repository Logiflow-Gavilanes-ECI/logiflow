import { Module } from '@nestjs/common';
import { SocketClientService } from './socket-client.service';

@Module({
  providers: [SocketClientService],
  exports: [SocketClientService],
})
export class SocketClientModule {}
