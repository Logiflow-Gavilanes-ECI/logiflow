import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

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
    return super.canActivate(context);
  }
}
