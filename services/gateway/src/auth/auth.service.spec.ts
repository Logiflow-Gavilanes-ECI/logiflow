import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'JWT_EXPIRES_IN') {
        return '1h';
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;

  const jwtService = {
    signAsync: jest.fn(async () => 'signed-token'),
  } as unknown as JwtService;

  const prismaService = {
    user: {
      create: jest.fn(async ({ data }: { data: { role: 'admin' | 'conductor' } }) => ({
        id: 'user-1',
        role: data.role,
      })),
    },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(configService, jwtService, prismaService);
  });

  it('creates a user and returns a signed token for a valid role', async () => {
    const result = await authService.register('driver@example.com', 'secret123', 'conductor');

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
});