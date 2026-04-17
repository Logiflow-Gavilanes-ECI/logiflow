import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @ApiOperation({
    summary: 'Register device token for push notifications',
    description:
      'Stores a device FCM token linked to the authenticated user for receiving push notifications.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'FCM device token' },
        platform: {
          type: 'string',
          enum: ['android', 'ios', 'web'],
          description: 'Device platform',
        },
      },
      required: ['token', 'platform'],
    },
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Token registered.' })
  @Post('register-device')
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @Req() req: any,
    @Body() body: { token: string; platform: string },
  ) {
    await this.notificationsService.registerDeviceToken(
      req.user.userId,
      body.token,
      body.platform,
    );
    return { registered: true };
  }
}
