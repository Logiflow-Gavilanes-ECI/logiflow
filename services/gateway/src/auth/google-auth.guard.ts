import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

const ALLOWED_APP_TARGETS = new Set(['web', 'admin']);

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    super();
    this.isEnabled = !!this.configService.get<string>('GOOGLE_CLIENT_ID');
  }

  canActivate(context: ExecutionContext) {
    if (!this.isEnabled) {
      const response = context.switchToHttp().getResponse();
      response.status(501).json({
        message: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      });
      return false;
    }

    const appTarget = this.extractAppTarget(context);
    if (appTarget !== undefined && !ALLOWED_APP_TARGETS.has(appTarget)) {
      throw new BadRequestException('Invalid app value. Use "web" or "admin".');
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const appTarget = this.extractAppTarget(context);
    if (appTarget && ALLOWED_APP_TARGETS.has(appTarget)) {
      return { state: appTarget };
    }

    return {};
  }

  private extractAppTarget(context: ExecutionContext): string | undefined {
    const request = context
      .switchToHttp()
      .getRequest<{ query?: Record<string, unknown> }>();
    const app = request.query?.app;

    return typeof app === 'string' ? app : undefined;
  }
}
