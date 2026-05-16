import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@logiflow.app',
    description: 'User email.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'demo123',
    minLength: 1,
    description: 'Plain text password sent over HTTPS.',
  })
  @IsString()
  @MinLength(1)
  password: string;
}
