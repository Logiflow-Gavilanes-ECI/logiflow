import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AUTH_ROLES, type AuthRole } from './auth-roles';

type RefreshTokenWriteClient = {
  refreshToken: {
    create: (args: {
      data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
      };
    }) => Promise<unknown>;
  };
};

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

    const demoUser = await this.prismaService.user.upsert({
      where: {
        id: 'demo-user',
      },
      update: {
        role: demoRole,
      },
      create: {
        id: 'demo-user',
        role: demoRole,
      },
    });

    const refreshTokenData = await this.generateRefreshTokenWithTtl(
      demoUser.id,
    );

    const payload = {
      sub: demoUser.id,
      username,
      role: demoRole,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      refreshToken: refreshTokenData.refreshToken,
      refreshTokenExpiresAt: refreshTokenData.expiresAt,
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

  private async generateRefreshTokenWithTtl(userId: string) {
    const ttlMinutesRaw = this.configService.get<string>(
      'REFRESH_TOKEN_TTL_MINUTES',
      '10080',
    );
    const ttlMinutes = Number(ttlMinutesRaw);

    if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
      throw new BadRequestException('Invalid refresh token TTL configuration');
    }

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAtDate = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const refreshTokenClient =
      this.prismaService as PrismaClient & RefreshTokenWriteClient;

    await refreshTokenClient.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: expiresAtDate,
      },
    });

    return {
      refreshToken,
      expiresAt: expiresAtDate.toISOString(),
    };
  }
}
