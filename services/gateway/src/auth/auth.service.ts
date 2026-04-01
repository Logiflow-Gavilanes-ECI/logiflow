import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AUTH_ROLES, type AuthRole } from './auth-roles';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaClient,
  ) {}

  async login(username: string, password: string) {
    const demoUsername = this.configService.get<string>(
      'AUTH_DEMO_USERNAME',
      'demo',
    );
    const demoPassword = this.configService.get<string>(
      'AUTH_DEMO_PASSWORD',
      'demo123',
    );

    if (username !== demoUsername || password !== demoPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const demoRole = this.configService.get<AuthRole>(
      'AUTH_DEMO_ROLE',
      'conductor',
    );

    if (!AUTH_ROLES.includes(demoRole)) {
      throw new BadRequestException('Invalid role');
    }

    const payload = {
      sub: 'demo-user',
      username,
      role: demoRole,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
    };
  }

  async register(email: string, password: string, role: string) {
    if (!AUTH_ROLES.includes(role as AuthRole)) {
      throw new BadRequestException('Invalid role');
    }

    const user = await this.prismaService.user.create({
      data: {
        role: role as AuthRole,
      },
    });

    const payload = {
      sub: user.id,
      username: email,
      email,
      role: user.role,
    };

    void password;

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
      user: {
        id: user.id,
        role: user.role,
      },
    };
  }
}
