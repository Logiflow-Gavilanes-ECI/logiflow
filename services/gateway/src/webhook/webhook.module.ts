import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { GrpcClientModule } from '../grpc-client/grpc-client.module';
import { SocketClientModule } from '../socket-client/socket-client.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [GrpcClientModule, SocketClientModule, NotificationsModule],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
