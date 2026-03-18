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

export class JobDto {
  @IsString()
  id!: string;

  @ValidateNested()
  @Type(() => CoordinateDto)
  location!: CoordinateDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  service?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

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
  @IsNumber({}, { each: true })
  skills?: number[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  priority?: number;
}
