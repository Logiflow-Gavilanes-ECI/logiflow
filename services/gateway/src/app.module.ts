import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { SocketClientModule } from './socket-client/socket-client.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { StopsModule } from './stops/stops.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    GrpcClientModule,
    SocketClientModule,
    WebhookModule,
    VehiclesModule,
    StopsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
