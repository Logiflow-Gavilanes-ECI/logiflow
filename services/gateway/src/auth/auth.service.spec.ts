import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthRole = 'admin' | 'conductor';

type PrismaLike = {
  user: {
    upsert: jest.Mock;
  };
  vehicle: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    upsert: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type TokenPairResponse = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: string;
  expiresIn: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    role: AuthRole;
    avatar: string | null;
  };
};

describe('AuthService', () => {
  let authService: AuthService;

  const configGetMock = jest.fn((key: string, defaultValue?: string) => {
    if (key === 'JWT_EXPIRES_IN') return '1h';
    if (key === 'REFRESH_TOKEN_TTL_MINUTES') return '60';
    return defaultValue;
  });

  const configService = {
    get: configGetMock,
  } as unknown as ConfigService;

  const signAsyncMock = jest.fn(() => Promise.resolve('signed-token'));
  const jwtService = {
    signAsync: signAsyncMock,
  } as unknown as JwtService;

  const prismaService: PrismaLike = {
    user: {
      upsert: jest.fn(
        (args: {
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) =>
          Promise.resolve({
            id: 'user-google-1',
            email: (args.update.email ??
              args.create.email ??
              'driver@gmail.com') as string,
            name: (args.update.name ??
              args.create.name ??
              'Test Driver') as string,
            role: (args.create.role ?? 'conductor') as AuthRole,
            provider: (args.create.provider ?? 'google') as string,
            googleId: (args.create.googleId ?? 'google-123') as string,
            avatar: (args.update.avatar ?? args.create.avatar ?? null) as
              | string
              | null,
          }),
      ),
    },
    vehicle: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      findFirst: jest.fn(() => Promise.resolve(null)),
      upsert: jest.fn(({ create }: { create: { id: string } }) =>
        Promise.resolve({ id: create.id }),
      ),
    },
    refreshToken: {
      create: jest.fn(
        ({
          data,
        }: {
          data: { userId: string; tokenHash: string; expiresAt: Date };
        }) =>
          Promise.resolve({
            id: 'rt-1',
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            createdAt: new Date(),
            consumedAt: null,
          }),
      ),
      findUnique: jest.fn(() => Promise.resolve(null)),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    $transaction: jest.fn((callback: (tx: PrismaLike) => Promise<unknown>) =>
      callback(prismaService),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaService.refreshToken.findUnique.mockResolvedValue(null);
    prismaService.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prismaService.vehicle.findUnique.mockResolvedValue(null);
    prismaService.vehicle.findFirst.mockResolvedValue(null);
    prismaService.vehicle.upsert.mockImplementation(
      ({ create }: { create: { id: string } }) =>
        Promise.resolve({ id: create.id }),
    );
    authService = new AuthService(
      configService,
      jwtService,
      prismaService as unknown as PrismaService,
    );
  });

  it('creates a user via Google OAuth and returns a signed token pair', async () => {
    const result = (await authService.googleLogin({
      googleId: 'google-123',
      email: 'driver@gmail.com',
      name: 'Test Driver',
      avatar: 'https://photo.url/avatar.jpg',
    })) as TokenPairResponse;

    expect(prismaService.user.upsert).toHaveBeenCalledWith({
      where: { googleId: 'google-123' },
      update: {
        email: 'driver@gmail.com',
        name: 'Test Driver',
        avatar: 'https://photo.url/avatar.jpg',
      },
      create: {
        email: 'driver@gmail.com',
        name: 'Test Driver',
        role: 'conductor',
        provider: 'google',
        googleId: 'google-123',
        avatar: 'https://photo.url/avatar.jpg',
      },
    });

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-google-1',
        email: 'driver@gmail.com',
        role: 'conductor',
        vehicleId: 'user-google-1',
      }),
    );

    expect(result.accessToken).toBe('signed-token');
    expect(typeof result.refreshToken).toBe('string');
    expect(typeof result.refreshTokenExpiresAt).toBe('string');
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe('1h');
    expect(result.user).toEqual({
      id: 'user-google-1',
      email: 'driver@gmail.com',
      name: 'Test Driver',
      role: 'conductor',
      avatar: 'https://photo.url/avatar.jpg',
    });
  });

  it('defaults avatar to null when not provided in Google profile', async () => {
    const result = (await authService.googleLogin({
      googleId: 'google-456',
      email: 'admin@gmail.com',
      name: 'Admin User',
    })) as TokenPairResponse;

    expect(prismaService.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          avatar: null,
        }),
      }),
    );

    expect(result.accessToken).toBe('signed-token');
  });

  it('rotates a valid refresh token and issues a new token pair', async () => {
    prismaService.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'rt-old',
      userId: 'user-google-1',
      tokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      consumedAt: null,
      user: {
        id: 'user-google-1',
        role: 'conductor',
        email: 'driver@gmail.com',
      },
    });
    prismaService.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });

    const refreshResult = (await authService.refresh(
      'incoming-refresh-token',
    )) as TokenPairResponse;

    expect(refreshResult.accessToken).toBe('signed-token');
    expect(typeof refreshResult.refreshToken).toBe('string');
    expect(typeof refreshResult.refreshTokenExpiresAt).toBe('string');
    expect(refreshResult.tokenType).toBe('Bearer');
    expect(refreshResult.expiresIn).toBe('1h');

    expect(prismaService.$transaction).toHaveBeenCalledTimes(1);

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-google-1',
        email: 'driver@gmail.com',
        role: 'conductor',
        vehicleId: 'user-google-1',
      }),
    );
  });

  it('rejects refresh when token does not exist', async () => {
    prismaService.refreshToken.findUnique.mockResolvedValueOnce(null);

    await expect(
      authService.refresh('non-existent-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prismaService.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects refresh when token is expired', async () => {
    prismaService.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'rt-expired',
      userId: 'user-google-1',
      tokenHash: 'expired-hash',
      expiresAt: new Date(Date.now() - 60 * 1000),
      createdAt: new Date(),
      consumedAt: null,
      user: {
        id: 'user-google-1',
        role: 'conductor',
        email: 'driver@gmail.com',
      },
    });

    await expect(authService.refresh('expired-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prismaService.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects refresh token replay after it has already been consumed', async () => {
    const consumedAt = new Date();
    prismaService.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'rt-consumed',
      userId: 'user-google-1',
      tokenHash: 'consumed-hash',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      consumedAt,
      user: {
        id: 'user-google-1',
        role: 'conductor',
        email: 'driver@gmail.com',
      },
    });

    await expect(authService.refresh('replayed-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prismaService.refreshToken.create).not.toHaveBeenCalled();
  });
});
