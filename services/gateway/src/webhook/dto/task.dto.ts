import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CoordinateDto } from './coordinate.dto';

export class TaskDto {
  @IsString()
  id!: string;

  @ValidateNested()
  @Type(() => CoordinateDto)
  location!: CoordinateDto;

  @IsOptional()
  @IsNumber()
  service?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  timeWindowStart?: number;

  @IsOptional()
  @IsNumber()
  timeWindowEnd?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restrictions?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  skills?: number[];
}
