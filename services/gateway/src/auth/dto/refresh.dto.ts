import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({
    example:
      '71faacb32ee3a07d80716653c046a466754999e9fe5398429c7e3dffc70cc680225977cfd25c9b178b2729c557f6ddf8',
    description: 'Opaque refresh token previously issued by login or refresh.',
    minLength: 20,
  })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}
