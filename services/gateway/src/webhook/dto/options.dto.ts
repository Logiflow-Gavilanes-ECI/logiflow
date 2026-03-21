import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class OptionsDto {
  @IsOptional()
  @IsBoolean()
  geometry?: boolean;

  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsBoolean()
  optimize?: boolean;

  @IsOptional()
  @IsString()
  algorithm?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxJobsPerRoute?: number;
}
