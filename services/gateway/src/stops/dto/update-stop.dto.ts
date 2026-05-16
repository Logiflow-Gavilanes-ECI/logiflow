import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class UpdateStopDto {
  @IsOptional()
  @IsString()
  address?: string;

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
  demand?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;
}
