import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'demo',
    description: 'Username used to authenticate and request JWT tokens.',
  })
  @IsString()
  @MinLength(3)
  username!: string;

  @ApiProperty({
    example: 'demo123',
    description: 'Plain password for authentication.',
    minLength: 3,
  })
  @IsString()
  @MinLength(3)
  password!: string;
}
