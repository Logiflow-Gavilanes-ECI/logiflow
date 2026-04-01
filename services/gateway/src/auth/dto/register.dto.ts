import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

const ALLOWED_ROLES = ['admin', 'conductor'] as const;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsIn(ALLOWED_ROLES)
  role!: (typeof ALLOWED_ROLES)[number];
}