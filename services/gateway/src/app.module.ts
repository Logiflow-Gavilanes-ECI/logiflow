import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { SocketClientModule } from './socket-client/socket-client.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { StopsModule } from './stops/stops.module';
import { PrismaModule } from './prisma/prisma.module';
import { RetryModule } from './common/retry/retry.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RetryModule,
    GrpcClientModule,
    SocketClientModule,
    WebhookModule,
    VehiclesModule,
    StopsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
