import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { AUTH_ROLES } from '../auth-roles';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsIn(AUTH_ROLES)
  role!: (typeof AUTH_ROLES)[number];
}