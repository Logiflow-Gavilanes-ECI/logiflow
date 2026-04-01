import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  type PrismaClientMock = PrismaClient & {
    user: {
      create: jest.Mock;
      upsert: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
    };
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'JWT_EXPIRES_IN') {
        return '1h';
      }

      if (key === 'AUTH_DEMO_ROLE') {
        return 'conductor';
      }

      if (key === 'REFRESH_TOKEN_TTL_MINUTES') {
        return '60';
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;

  const jwtService = {
    signAsync: jest.fn(async () => 'signed-token'),
  } as unknown as JwtService;

  const prismaService = {
    user: {
      create: jest.fn(
        async ({ data }: { data: { role: 'admin' | 'conductor' } }) => ({
          id: 'user-1',
          role: data.role,
        }),
      ),
      upsert: jest.fn(
        async ({
          create,
        }: {
          create: { id: string; role: 'admin' | 'conductor' };
        }) => ({
          id: create.id,
          role: create.role,
        }),
      ),
    },
    refreshToken: {
      create: jest.fn(
        async ({ data }: { data: { userId: string; tokenHash: string } }) => ({
          id: 'rt-1',
          userId: data.userId,
          tokenHash: data.tokenHash,
        }),
      ),
    },
  } as PrismaClientMock;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(
      configService,
      jwtService,
      prismaService,
    );
  });

  it('creates a user and returns a signed token for a valid role', async () => {
    const result = await authService.register(
      'driver@example.com',
      'secret123',
      'conductor',
    );

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: { role: 'conductor' },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        username: 'driver@example.com',
        email: 'driver@example.com',
        role: 'conductor',
      }),
    );
    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresIn: '1h',
      user: {
        id: 'user-1',
        role: 'conductor',
      },
    });
  });

  it('rejects a role outside the allowed set', async () => {
    await expect(
      authService.register('admin@example.com', 'secret123', 'manager'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaService.user.create).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('includes the configured demo role in the login token payload', async () => {
    const loginResult = await authService.login('demo', 'demo123');

    expect(prismaService.user.upsert).toHaveBeenCalledWith({
      where: { id: 'demo-user' },
      update: { role: 'conductor' },
      create: { id: 'demo-user', role: 'conductor' },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'demo-user',
        username: 'demo',
        role: 'conductor',
      }),
    );
    expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'demo-user',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    expect(loginResult).toEqual({
      accessToken: 'signed-token',
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: '1h',
    });
  });
});
