import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthRole = 'admin' | 'conductor';

type UserRecord = {
  id: string;
  role: AuthRole;
};

type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
  user?: UserRecord;
};

type RefreshTokenCreateArgs = {
  data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  };
};

type RefreshTokenFindUniqueArgs = {
  where: {
    tokenHash: string;
  };
  include: {
    user: true;
  };
};

type RefreshTokenUpdateManyArgs = {
  where: {
    id: string;
    consumedAt: null;
  };
  data: {
    consumedAt: Date;
  };
};

type UserCreateArgs = {
  data: {
    role: AuthRole;
  };
};

type UserUpsertArgs = {
  where: {
    id: string;
  };
  update: {
    role: AuthRole;
  };
  create: {
    id: string;
    role: AuthRole;
  };
};

type PrismaLike = {
  user: {
    create: jest.Mock<Promise<UserRecord>, [UserCreateArgs]>;
    upsert: jest.Mock<Promise<UserRecord>, [UserUpsertArgs]>;
  };
  refreshToken: {
    create: jest.Mock<Promise<RefreshTokenRecord>, [RefreshTokenCreateArgs]>;
    findUnique: jest.Mock<
      Promise<(RefreshTokenRecord & { user: UserRecord }) | null>,
      [RefreshTokenFindUniqueArgs]
    >;
    updateMany: jest.Mock<
      Promise<{ count: number }>,
      [RefreshTokenUpdateManyArgs]
    >;
  };
  $transaction: jest.Mock<
    Promise<unknown>,
    [(callback: (tx: PrismaLike) => Promise<unknown>) => Promise<unknown>]
  >;
};

type RegisterResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: {
    id: string;
    role: AuthRole;
  };
};

type TokenPairResponse = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: string;
  expiresIn: string;
};

describe('AuthService', () => {
  let authService: AuthService;

  const configGetMock = jest.fn((key: string, defaultValue?: string) => {
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
      create: jest.fn(({ data }: UserCreateArgs) =>
        Promise.resolve({
          id: 'user-1',
          role: data.role,
        }),
      ),
      upsert: jest.fn(({ create }: UserUpsertArgs) =>
        Promise.resolve({
          id: create.id,
          role: create.role,
        }),
      ),
    },
    refreshToken: {
      create: jest.fn(({ data }: RefreshTokenCreateArgs) =>
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
    authService = new AuthService(
      configService,
      jwtService,
      prismaService as unknown as PrismaService,
    );
  });

  it('creates a user and returns a signed token for a valid role', async () => {
    const result = (await authService.register(
      'driver@example.com',
      'secret123',
      'conductor',
    )) as RegisterResponse;

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: { role: 'conductor' },
    });
    expect(signAsyncMock).toHaveBeenCalledWith(
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
    expect(signAsyncMock).not.toHaveBeenCalled();
  });

  it('includes the configured demo role in the login token payload', async () => {
    const loginResult = (await authService.login(
      'demo',
      'demo123',
    )) as TokenPairResponse;

    expect(loginResult.accessToken).toBe('signed-token');
    expect(typeof loginResult.refreshToken).toBe('string');
    expect(typeof loginResult.refreshTokenExpiresAt).toBe('string');
    expect(loginResult.tokenType).toBe('Bearer');
    expect(loginResult.expiresIn).toBe('1h');

    expect(prismaService.user.upsert).toHaveBeenCalledWith({
      where: { id: 'demo-user' },
      update: { role: 'conductor' },
      create: { id: 'demo-user', role: 'conductor' },
    });
    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'demo-user',
        username: 'demo',
        role: 'conductor',
      }),
    );

    const refreshTokenCreateArgs =
      prismaService.refreshToken.create.mock.calls[0]?.[0];
    expect(refreshTokenCreateArgs).toBeDefined();
    expect(refreshTokenCreateArgs?.data.userId).toBe('demo-user');
    expect(typeof refreshTokenCreateArgs?.data.tokenHash).toBe('string');
    expect(refreshTokenCreateArgs?.data.expiresAt).toBeInstanceOf(Date);
  });

  it('rotates a valid refresh token and issues a new token pair', async () => {
    prismaService.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'rt-old',
      userId: 'demo-user',
      tokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      consumedAt: null,
      user: {
        id: 'demo-user',
        role: 'conductor',
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

    const findUniqueArgs =
      prismaService.refreshToken.findUnique.mock.calls[0]?.[0];
    expect(findUniqueArgs).toBeDefined();
    expect(typeof findUniqueArgs?.where.tokenHash).toBe('string');
    expect(findUniqueArgs?.include.user).toBe(true);

    const updateManyArgs =
      prismaService.refreshToken.updateMany.mock.calls[0]?.[0];
    expect(updateManyArgs).toBeDefined();
    expect(updateManyArgs?.where.id).toBe('rt-old');
    expect(updateManyArgs?.where.consumedAt).toBeNull();
    expect(updateManyArgs?.data.consumedAt).toBeInstanceOf(Date);

    const refreshCreateArgs =
      prismaService.refreshToken.create.mock.calls[0]?.[0];
    expect(refreshCreateArgs).toBeDefined();
    expect(refreshCreateArgs?.data.userId).toBe('demo-user');
    expect(typeof refreshCreateArgs?.data.tokenHash).toBe('string');
    expect(refreshCreateArgs?.data.expiresAt).toBeInstanceOf(Date);

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'demo-user',
        username: 'demo',
        role: 'conductor',
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
      userId: 'demo-user',
      tokenHash: 'expired-hash',
      expiresAt: new Date(Date.now() - 60 * 1000),
      createdAt: new Date(),
      consumedAt: null,
      user: {
        id: 'demo-user',
        role: 'conductor',
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
      userId: 'demo-user',
      tokenHash: 'consumed-hash',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      consumedAt,
      user: {
        id: 'demo-user',
        role: 'conductor',
      },
    });

    await expect(authService.refresh('replayed-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prismaService.refreshToken.create).not.toHaveBeenCalled();
  });
});
