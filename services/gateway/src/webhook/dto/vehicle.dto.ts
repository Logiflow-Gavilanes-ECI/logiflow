import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CoordinateDto } from './coordinate.dto';

export class VehicleDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  profile?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  start?: CoordinateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  end?: CoordinateDto;

  @IsNumber()
  @Min(0)
  capacity!: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  skills?: number[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  timeWindowStart?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  timeWindowEnd?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restrictions?: string[];
}
