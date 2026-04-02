import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
