import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehiclesRepository } from './vehicles.repository';
import { StopsModule } from '../stops/stops.module';
import { ActiveRouteRepository } from './active-route.repository';

@Module({
  imports: [StopsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehiclesRepository, ActiveRouteRepository],
  exports: [VehiclesService, VehiclesRepository, ActiveRouteRepository],
})
export class VehiclesModule {}
