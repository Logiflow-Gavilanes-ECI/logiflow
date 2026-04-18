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
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleAuthGuard } from './google-auth.guard';

type GoogleFrontendTarget = 'web' | 'admin' | 'mobile';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Authenticate user',
    description:
      'Validates credentials and returns an access token plus refresh token pair.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authentication successful.',
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
    description: 'Invalid credentials.',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  @ApiOperation({
    summary: 'Register user',
    description:
      'Creates a new user role record and returns a signed access token.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User created successfully.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        tokenType: { type: 'string', example: 'Bearer' },
        expiresIn: { type: 'string', example: '1h' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'conductor'] },
          },
          required: ['id', 'role'],
        },
      },
      required: ['accessToken', 'tokenType', 'expiresIn', 'user'],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid payload or unsupported role.',
  })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.role);
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
  async googleCallback(@Req() req: any, @Res() res: any) {
    const result = await this.authService.googleLogin(req.user);
    const state = this.parseFrontendTarget(req?.query?.state);
    const frontendUrl = this.resolveFrontendRedirectBase(state);

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
    const { OAuth2Client } = await import('google-auth-library');
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
