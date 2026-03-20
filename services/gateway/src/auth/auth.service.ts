import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const demoUsername = this.configService.get<string>(
      'AUTH_DEMO_USERNAME',
      'demo',
    );
    const demoPassword = this.configService.get<string>(
      'AUTH_DEMO_PASSWORD',
      'demo123',
    );

    if (username !== demoUsername || password !== demoPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: 'demo-user',
      username,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
    };
  }
}
