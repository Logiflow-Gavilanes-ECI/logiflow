import { IsArray, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CoordinateDto } from './coordinate.dto';

export class MatrixDto {
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  distances?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  durations?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  locations?: CoordinateDto[];
}
