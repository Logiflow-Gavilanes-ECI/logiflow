import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'logiflow-core-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
