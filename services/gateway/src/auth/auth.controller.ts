import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthGuard } from './google-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
}

interface GoogleAuthRequest extends Request {
  user: GoogleProfile;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
  };
}

type GoogleFrontendTarget = 'web' | 'admin' | 'mobile';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Register test user',
    description:
      'Creates a local email/password user for demo access. Passwords are stored as bcrypt hashes.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User created.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'conductor'] },
      },
      required: ['id', 'email', 'role'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A user with this email already exists.',
  })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Validates a local user password and returns an access token for the demo frontend.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'conductor'] },
      },
      required: ['accessToken', 'role'],
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Email or password is invalid.',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Consumes a valid refresh token and returns a rotated refresh token with new access token.',
  })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token refresh successful.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        refreshTokenExpiresAt: {
          type: 'string',
          format: 'date-time',
        },
        tokenType: { type: 'string', example: 'Bearer' },
        expiresIn: { type: 'string', example: '1h' },
      },
      required: [
        'accessToken',
        'refreshToken',
        'refreshTokenExpiresAt',
        'tokenType',
        'expiresIn',
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Refresh token is invalid, expired, or already consumed.',
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get authenticated user profile',
    description:
      'Returns profile information for the user identified by the JWT access token.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authenticated user profile.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', nullable: true },
        name: { type: 'string', nullable: true },
        role: { type: 'string', enum: ['admin', 'conductor'] },
        avatar: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'email', 'name', 'role', 'avatar', 'createdAt'],
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Access token is missing, invalid, or user no longer exists.',
  })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user?.userId ?? '');
  }

  @ApiOperation({
    summary: 'Initiate Google OAuth login',
    description:
      'Redirects to Google consent screen for OAuth authentication. Optional ?app=admin targets admin frontend redirect.',
  })
  @ApiQuery({
    name: 'app',
    required: false,
    enum: ['web', 'admin', 'mobile'],
    description:
      'Optional frontend target. admin uses GOOGLE_REDIRECT_FRONTEND_ADMIN; mobile uses GOOGLE_REDIRECT_FRONTEND_MOBILE; otherwise defaults to GOOGLE_REDIRECT_FRONTEND.',
  })
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Guard redirects to Google
  }

  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Handles Google OAuth callback, creates/updates user, and redirects with tokens to /auth/callback in the selected frontend.',
  })
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: GoogleAuthRequest, @Res() res: Response) {
    const result = await this.authService.googleLogin(req.user);
    const state = this.parseFrontendTarget(req?.query?.state);
    const frontendUrl = this.resolveFrontendRedirectBase(state);

    if (state === 'mobile') {
      const mobileParams = new URLSearchParams({
        token: result.accessToken,
      });

      res.redirect(`${frontendUrl}?${mobileParams.toString()}`);
      return;
    }

    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      role: result.user.role,
    });

    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  @ApiOperation({
    summary: 'Exchange Google ID token for JWT',
    description:
      'Mobile clients send Google ID token directly; backend validates and returns JWT.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        idToken: { type: 'string' },
      },
      required: ['idToken'],
    },
  })
  @Post('google/token')
  @HttpCode(HttpStatus.OK)
  async googleTokenExchange(@Body() body: { idToken: string }) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const client = new OAuth2Client(clientId);

    const ticket = await client.verifyIdToken({
      idToken: body.idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      throw new Error('Invalid Google ID token');
    }

    return this.authService.googleLogin({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
      avatar: payload.picture,
    });
  }

  private parseFrontendTarget(value: unknown): GoogleFrontendTarget {
    if (value === 'admin') return 'admin';
    if (value === 'mobile') return 'mobile';
    return 'web';
  }

  private resolveFrontendRedirectBase(target: GoogleFrontendTarget): string {
    const defaultWebFrontend = 'http://localhost:4200';
    const rawWebFrontend =
      this.configService.get<string>(
        'GOOGLE_REDIRECT_FRONTEND',
        defaultWebFrontend,
      ) ?? defaultWebFrontend;
    const webFrontend = rawWebFrontend.trim() || defaultWebFrontend;

    const rawAdminFrontend =
      this.configService.get<string>('GOOGLE_REDIRECT_FRONTEND_ADMIN') ?? '';
    const adminFrontend = rawAdminFrontend.trim() || webFrontend;

    const defaultMobileFrontend = 'http://localhost:8100';
    const rawMobileFrontend =
      this.configService.get<string>('GOOGLE_REDIRECT_FRONTEND_MOBILE') ?? '';
    const mobileFrontend = rawMobileFrontend.trim() || defaultMobileFrontend;

    let selectedFrontend: string;
    if (target === 'admin') selectedFrontend = adminFrontend;
    else if (target === 'mobile') selectedFrontend = mobileFrontend;
    else selectedFrontend = webFrontend;

    return selectedFrontend.endsWith('/')
      ? selectedFrontend.slice(0, -1)
      : selectedFrontend;
  }
}
