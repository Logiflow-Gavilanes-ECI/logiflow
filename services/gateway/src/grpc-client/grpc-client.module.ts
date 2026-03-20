import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { GrpcClientService } from './grpc-client.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'ROUTE_OPTIMIZER_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const protoPath =
            configService.get<string>('GRPC_OPTIMIZER_PROTO_PATH') ??
            resolve(
              process.cwd(),
              '..',
              '..',
              'shared',
              'proto',
              'optimizer.proto',
            );

          return {
            transport: Transport.GRPC,
            options: {
              package: 'logiflow',
              protoPath,
              url: `${configService.get<string>('GRPC_OPTIMIZER_HOST', 'localhost')}:${configService.get<string>('GRPC_OPTIMIZER_PORT', '50051')}`,
              loader: {
                keepCase: false,
                longs: String,
                enums: Number,
                defaults: false,
                oneofs: true,
              },
            },
          };
        },
      },
    ]),
  ],
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class GrpcClientModule {}
