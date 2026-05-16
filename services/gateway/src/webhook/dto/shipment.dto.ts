import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskDto } from './task.dto';

export class ShipmentDto {
  @IsString()
  id!: string;

  @ValidateNested()
  @Type(() => TaskDto)
  pickup!: TaskDto;

  @ValidateNested()
  @Type(() => TaskDto)
  delivery!: TaskDto;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  skills?: number[];

  @IsOptional()
  @IsNumber()
  priority?: number;
}
