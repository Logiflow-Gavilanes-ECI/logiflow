import { IsNumber, IsString, IsOptional, Min, Max } from 'class-validator';

export class StopDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsNumber()
  @Min(0)
  demand!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;
}
