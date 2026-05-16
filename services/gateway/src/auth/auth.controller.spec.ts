import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

type AuthServiceMock = {
  register: jest.Mock;
  login: jest.Mock;
  refresh: jest.Mock;
  getProfile: jest.Mock;
  googleLogin: jest.Mock;
};

describe('AuthController', () => {
  const googleProfile = {
    googleId: 'google-123',
    email: 'driver@example.com',
    name: 'Demo Driver',
    avatar: 'https://example.com/avatar.png',
  };

  const tokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: '2026-05-15T12:00:00.000Z',
    tokenType: 'Bearer',
    expiresIn: '1h',
    user: {
      id: 'user-1',
      email: 'driver@example.com',
      name: 'Demo Driver',
      role: 'conductor' as const,
      avatar: 'https://example.com/avatar.png',
    },
  };

  let authService: AuthServiceMock;
  let configValues: Record<string, string | undefined>;
  let controller: AuthController;
  let verifyIdToken: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues = {};
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      getProfile: jest.fn(),
      googleLogin: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        return configValues[key] ?? fallback;
      }),
    };
    verifyIdToken = jest.fn();
    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
      verifyIdToken,
    }));

    controller = new AuthController(
      authService as unknown as AuthService,
      configService as unknown as ConfigService,
    );
  });

  it('delegates local auth endpoints to AuthService', async () => {
    authService.register.mockResolvedValueOnce({
      id: 'user-1',
      email: 'driver@example.com',
      role: 'conductor',
    });
    authService.login.mockResolvedValueOnce({
      accessToken: 'access-token',
      role: 'conductor',
    });
    authService.refresh.mockResolvedValueOnce(tokenPair);

    await expect(
      controller.register({
        email: 'driver@example.com',
        password: 'demo123',
        role: 'conductor',
      }),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'driver@example.com',
      role: 'conductor',
    });
    await expect(
      controller.login({
        email: 'driver@example.com',
        password: 'demo123',
      }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      role: 'conductor',
    });
    await expect(
      controller.refresh({ refreshToken: 'refresh-token' }),
    ).resolves.toEqual(tokenPair);

    expect(authService.register).toHaveBeenCalledWith({
      email: 'driver@example.com',
      password: 'demo123',
      role: 'conductor',
    });
    expect(authService.login).toHaveBeenCalledWith({
      email: 'driver@example.com',
      password: 'demo123',
    });
    expect(authService.refresh).toHaveBeenCalledWith('refresh-token');
  });

  it('loads the authenticated profile from the JWT user id', async () => {
    const profile = {
      id: 'user-1',
      email: 'driver@example.com',
      name: 'Demo Driver',
      role: 'conductor',
      avatar: null,
      createdAt: '2026-05-14T12:00:00.000Z',
    };
    authService.getProfile.mockResolvedValueOnce(profile);

    await expect(
      controller.me({ user: { userId: 'user-1' } } as any),
    ).resolves.toEqual(profile);
    expect(authService.getProfile).toHaveBeenCalledWith('user-1');

    authService.getProfile.mockResolvedValueOnce(profile);
    await controller.me({ user: {} } as any);
    expect(authService.getProfile).toHaveBeenLastCalledWith('');
  });

  it('keeps googleAuth empty because the guard owns the redirect', () => {
    expect(controller.googleAuth()).toBeUndefined();
  });

  it('redirects web and admin Google callbacks with token pair query params', async () => {
    const response = { redirect: jest.fn() } as unknown as Response;
    authService.googleLogin.mockResolvedValue(tokenPair);
    configValues.GOOGLE_REDIRECT_FRONTEND = 'https://app.example.com/';
    configValues.GOOGLE_REDIRECT_FRONTEND_ADMIN = 'https://admin.example.com/';

    await controller.googleCallback(
      { user: googleProfile, query: { state: 'web' } } as any,
      response,
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.example.com/auth/callback?accessToken=access-token&refreshToken=refresh-token&role=conductor',
    );

    await controller.googleCallback(
      { user: googleProfile, query: { state: 'admin' } } as any,
      response,
    );
    expect(response.redirect).toHaveBeenLastCalledWith(
      'https://admin.example.com/auth/callback?accessToken=access-token&refreshToken=refresh-token&role=conductor',
    );
  });

  it('redirects mobile Google callbacks to the mobile target with only the access token', async () => {
    const response = { redirect: jest.fn() } as unknown as Response;
    authService.googleLogin.mockResolvedValueOnce(tokenPair);
    configValues.GOOGLE_REDIRECT_FRONTEND_MOBILE = '';

    await controller.googleCallback(
      { user: googleProfile, query: { state: 'mobile' } } as any,
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      'http://localhost:8100?token=access-token',
    );
  });

  it('exchanges a Google ID token for an application token pair', async () => {
    configValues.GOOGLE_CLIENT_ID = 'google-client-id';
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-sub',
        email: 'mobile@example.com',
        name: undefined,
        picture: 'https://example.com/mobile.png',
      }),
    });
    authService.googleLogin.mockResolvedValueOnce(tokenPair);

    await expect(
      controller.googleTokenExchange({ idToken: 'id-token' }),
    ).resolves.toEqual(tokenPair);

    expect(OAuth2Client).toHaveBeenCalledWith('google-client-id');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: 'google-client-id',
    });
    expect(authService.googleLogin).toHaveBeenCalledWith({
      googleId: 'google-sub',
      email: 'mobile@example.com',
      name: 'mobile@example.com',
      avatar: 'https://example.com/mobile.png',
    });
  });

  it('rejects Google ID tokens without a subject or email', async () => {
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'google-sub' }),
    });

    await expect(
      controller.googleTokenExchange({ idToken: 'invalid-token' }),
    ).rejects.toThrow('Invalid Google ID token');
    expect(authService.googleLogin).not.toHaveBeenCalled();
  });
});
