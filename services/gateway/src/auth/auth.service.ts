import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthRole } from './auth-roles';
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
  $transaction: <T>(
    callback: (tx: RefreshTokenWriteClient) => Promise<T>,
  ) => Promise<T>;
};

type VehicleWriteClient = {
  vehicle: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
    } | null>;
    findFirst: (args: { orderBy: { createdAt: 'asc' } }) => Promise<{
      id: string;
    } | null>;
    upsert: (args: {
      where: { id: string };
      update: Record<string, never>;
      create: {
        id: string;
        lat: number;
        lng: number;
        capacity: number;
        plate: string;
        model: string;
        status: string;
      };
    }) => Promise<{ id: string }>;
  };
};

type StoredRefreshToken = {
  id: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  user: {
    id: string;
    role: AuthRole;
    email?: string | null;
  };
};

type AuthUserRecord = {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  role: AuthRole;
  provider: string;
  googleId: string | null;
  avatar: string | null;
};

type UserWriteClient = {
  user: {
    findUnique: (args: {
      where: { googleId?: string; email?: string; id?: string };
    }) => Promise<AuthUserRecord | null>;
    create: (args: {
      data: {
        email: string;
        passwordHash: string;
        role: AuthRole;
        provider: string;
      };
    }) => Promise<AuthUserRecord>;
    upsert: (args: {
      where: { id?: string; googleId?: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => Promise<AuthUserRecord>;
  };
};

type GoogleProfile = {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = LoginInput & {
  role: AuthRole;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
  ) {}

  async register(input: RegisterInput) {
    const userClient = this.prismaService as unknown as UserWriteClient;
    const email = this.normalizeEmail(input.email);

    const existingUser = await userClient.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await userClient.user.create({
      data: {
        email,
        passwordHash,
        role: input.role,
        provider: 'local',
      },
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async login(input: LoginInput) {
    const userClient = this.prismaService as unknown as UserWriteClient;
    const email = this.normalizeEmail(input.email);

    const user = await userClient.user.findUnique({
      where: { email },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: await this.issueAccessToken(user),
      role: user.role,
    };
  }

  async googleLogin(profile: GoogleProfile) {
    const userClient = this.prismaService as unknown as UserWriteClient;
    const email = this.normalizeEmail(profile.email);

    const adminEmails = (
      this.configService.get<string>('GOOGLE_ADMIN_EMAILS', '') ?? ''
    )
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isAdminEmail = adminEmails.includes(email);
    const roleForNewUser: AuthRole = isAdminEmail ? 'admin' : 'conductor';
    const existingUser = await userClient.user.findUnique({
      where: { email },
    });

    const updateData: Record<string, unknown> = {
      email,
      name: profile.name,
      avatar: profile.avatar ?? null,
      googleId: profile.googleId,
    };

    if (isAdminEmail) {
      updateData.role = 'admin';
    }

    const user = await userClient.user.upsert({
      where: existingUser
        ? { id: existingUser.id }
        : { googleId: profile.googleId },
      update: updateData,
      create: {
        email,
        name: profile.name,
        role: roleForNewUser,
        provider: 'google',
        googleId: profile.googleId,
        avatar: profile.avatar ?? null,
      },
    });

    const refreshTokenData = await this.generateRefreshTokenWithTtl(user.id);

    return {
      accessToken: await this.issueAccessToken(user),
      refreshToken: refreshTokenData.refreshToken,
      refreshTokenExpiresAt: refreshTokenData.expiresAt,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshTokenClient = this
      .prismaService as unknown as RefreshTokenWriteClient;
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

      if (
        !storedToken ||
        storedToken.consumedAt ||
        storedToken.expiresAt <= now
      ) {
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

      return {
        accessToken: await this.issueAccessToken(storedToken.user),
        refreshToken: rotatedToken.refreshToken,
        refreshTokenExpiresAt: rotatedToken.expiresAt,
        tokenType: 'Bearer',
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
      };
    });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async issueAccessToken(user: {
    id: string;
    email?: string | null;
    role: AuthRole;
  }) {
    const vehicleId = await this.resolveVehicleIdForUser(user.id, user.role);
    const payload = {
      sub: user.id,
      email: user.email ?? user.id,
      role: user.role,
      vehicleId,
    };

    return this.jwtService.signAsync(payload);
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
      client ?? (this.prismaService as unknown as RefreshTokenWriteClient);

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

  private async resolveVehicleIdForUser(userId: string, role?: AuthRole) {
    const trimmed = userId?.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      const vehicleClient = this.prismaService as unknown as VehicleWriteClient;
      const directMatch = await vehicleClient.vehicle.findUnique({
        where: { id: trimmed },
      });
      if (directMatch) {
        return directMatch.id;
      }

      if (role === 'conductor') {
        const created = await vehicleClient.vehicle.upsert({
          where: { id: trimmed },
          update: {},
          create: {
            id: trimmed,
            lat: 4.711,
            lng: -74.0721,
            capacity: 1,
            plate: 'ABC-123',
            model: 'Toyota Hilux 2023',
            status: 'online',
          },
        });
        return created.id;
      }

      const firstVehicle = await vehicleClient.vehicle.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      return firstVehicle?.id ?? trimmed;
    } catch {
      return trimmed;
    }
  }
}
