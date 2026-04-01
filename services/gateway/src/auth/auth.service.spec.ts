import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  type PrismaServiceMock = PrismaService & {
    user: {
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
    },
  } as PrismaServiceMock;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(
      configService,
      jwtService,
      prismaService as unknown as PrismaService,
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

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'demo-user',
        username: 'demo',
        role: 'conductor',
      }),
    );
    expect(loginResult).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresIn: '1h',
    });
  });
});
