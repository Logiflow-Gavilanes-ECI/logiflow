import { Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  ValidateNested,
  IsIn,
  IsOptional,
  ArrayMinSize,
  IsObject,
} from 'class-validator';
import { VehicleDto } from './vehicle.dto';
import { StopDto } from './stop.dto';
import { JobDto } from './job.dto';
import { ShipmentDto } from './shipment.dto';
import { MatrixDto } from './matrix.dto';
import { OptionsDto } from './options.dto';

export class WebhookEventDto {
  @IsString()
  @IsIn(['traffic_jam', 'new_order', 'vehicle_breakdown', 'weather_change'])
  eventType!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => VehicleDto)
  vehicles!: VehicleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  stops?: StopDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobDto)
  jobs?: JobDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentDto)
  shipments?: ShipmentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MatrixDto)
  matrix?: MatrixDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OptionsDto)
  options?: OptionsDto;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsObject()
  risk?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  maps?: Record<string, unknown>;
}
