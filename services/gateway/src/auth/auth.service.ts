import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { AUTH_ROLES, type AuthRole } from './auth-roles';
import { PrismaService } from '../prisma/prisma.service';

type RefreshTokenWriteClient = {
  refreshToken: {
    create: (args: {
      data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
      };
    }) => Promise<unknown>;
    findUnique: (args: {
      where: {
        tokenHash: string;
      };
      include: {
        user: true;
      };
    }) => Promise<StoredRefreshToken | null>;
    updateMany: (args: {
      where: {
        id: string;
        consumedAt: null;
      };
      data: {
        consumedAt: Date;
      };
    }) => Promise<{ count: number }>;
  };
  $transaction: <T>(callback: (tx: RefreshTokenWriteClient) => Promise<T>) => Promise<T>;
};

type StoredRefreshToken = {
  id: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  user: {
    id: string;
    role: AuthRole;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
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

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshTokenClient =
      this.prismaService as unknown as RefreshTokenWriteClient;
    const incomingTokenHash = this.hashRefreshToken(refreshToken);
    const now = new Date();

    return refreshTokenClient.$transaction(async (tx) => {
      const storedToken = await tx.refreshToken.findUnique({
        where: {
          tokenHash: incomingTokenHash,
        },
        include: {
          user: true,
        },
      });

      if (!storedToken || storedToken.consumedAt || storedToken.expiresAt <= now) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const consumeResult = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      if (consumeResult.count === 0) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const rotatedToken = await this.generateRefreshTokenWithTtl(
        storedToken.userId,
        tx,
      );

      const payload = {
        sub: storedToken.user.id,
        username: this.resolveUsername(storedToken.user.id),
        role: storedToken.user.role,
      };

      return {
        accessToken: await this.jwtService.signAsync(payload),
        refreshToken: rotatedToken.refreshToken,
        refreshTokenExpiresAt: rotatedToken.expiresAt,
        tokenType: 'Bearer',
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
      };
    });
  }

  private async generateRefreshTokenWithTtl(
    userId: string,
    client?: RefreshTokenWriteClient,
  ) {
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
      client ??
      (this.prismaService as unknown as RefreshTokenWriteClient);

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

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private resolveUsername(userId: string) {
    if (userId === 'demo-user') {
      return this.configService.get<string>('AUTH_DEMO_USERNAME', 'demo');
    }

    return userId;
  }
}
