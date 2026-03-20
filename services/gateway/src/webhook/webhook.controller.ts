import {
  Controller,
  Post,
  Body,
  Logger,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookEventDto } from './dto/webhook-event.dto';
import {
  CORRELATION_ID_HEADER,
  UNKNOWN_CORRELATION_ID,
} from '../common/constants/correlation-id.constant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('webhook')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  receiveEvent(
    @Body() event: WebhookEventDto,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ) {
    const effectiveCorrelationId = correlationId ?? UNKNOWN_CORRELATION_ID;
    this.logger.log(
      `Incoming webhook: ${event.eventType} | correlationId: ${effectiveCorrelationId}`,
    );

    return this.webhookService.handleEvent(event, effectiveCorrelationId);
  }
}
