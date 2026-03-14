import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_RETRY_OPTIONS, RetryOptions } from './retry.options';

export interface RetryContext {
  correlationId: string;
  operationName: string;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  /**
   * Executes `operation` up to `options.maxAttempts` times using exponential
   * backoff with jitter between each failed attempt.
   *
   * Formula for delay before attempt n (0-indexed):
   *   delay = min(baseDelayMs * 2^n, maxDelayMs) + random(0, delay * 0.2)
   *
   * If all attempts are exhausted, the last error is re-thrown so the caller
   * can decide the fallback strategy.
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: RetryContext,
    options: RetryOptions = DEFAULT_RETRY_OPTIONS,
  ): Promise<T> {
    const { maxAttempts, baseDelayMs, maxDelayMs } = options;
    const { correlationId, operationName } = context;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();

        if (attempt > 1) {
          this.logger.log(
            `[${operationName}] succeeded on attempt ${attempt}/${maxAttempts} | correlationId: ${correlationId}`,
          );
        }

        return result;
      } catch (error) {
        lastError = error;

        const isLastAttempt = attempt === maxAttempts;

        this.logger.warn(
          `[${operationName}] attempt ${attempt}/${maxAttempts} failed${isLastAttempt ? ' (no more retries)' : ''} | correlationId: ${correlationId} | error: ${error instanceof Error ? error.message : String(error)}`,
        );

        if (isLastAttempt) break;

        const delay = this.computeDelay(attempt, baseDelayMs, maxDelayMs);
        this.logger.log(
          `[${operationName}] retrying in ${delay}ms | correlationId: ${correlationId}`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Exponential backoff with ±20% jitter.
   * attempt is 1-based so the first retry uses exponent 0 (baseDelayMs * 1).
   */
  computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const exponential = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
    const jitter = Math.floor(Math.random() * exponential * 0.2);
    return exponential + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
