import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { AUTH_ROLES, type AuthRole } from '../auth-roles';

export class RegisterDto {
  @ApiProperty({
    example: 'admin@logiflow.app',
    description: 'User email.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'demo123',
    minLength: 6,
    description: 'Plain text password that will be stored as a bcrypt hash.',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    enum: AUTH_ROLES,
    example: 'admin',
    description: 'Role assigned to the test user.',
  })
  @IsIn([...AUTH_ROLES])
  role: AuthRole;
}
