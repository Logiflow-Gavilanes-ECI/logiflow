import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AUTH_ROLES } from '../auth-roles';

export class RegisterDto {
  @ApiProperty({
    example: 'driver@logiflow.com',
    description: 'Email used as logical username for registration payload.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'strongpass123',
    description: 'Password for account creation.',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    enum: AUTH_ROLES,
    example: 'conductor',
    description: 'Role assigned to the created user.',
  })
  @IsString()
  @IsIn(AUTH_ROLES)
  role!: (typeof AUTH_ROLES)[number];
}