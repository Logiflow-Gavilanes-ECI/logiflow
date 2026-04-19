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
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleAuthGuard } from './google-auth.guard';

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
}

interface GoogleAuthRequest extends Request {
  user: GoogleProfile;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

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
    description: 'Redirects to Google consent screen for OAuth authentication.',
  })
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Guard redirects to Google
  }

  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Handles Google OAuth callback, creates/updates user, and redirects with tokens.',
  })
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: GoogleAuthRequest, @Res() res: Response) {
    const result = await this.authService.googleLogin(req.user);

    const frontendUrl = this.configService.get<string>(
      'GOOGLE_REDIRECT_FRONTEND',
      'http://localhost:4200',
    );

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
}
