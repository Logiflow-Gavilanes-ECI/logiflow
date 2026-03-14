import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(() => {
    service = new RetryService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const context = { correlationId: 'corr-test', operationName: 'test.op' };
  const options = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };

  describe('execute', () => {
    it('should return the result immediately on first success', async () => {
      const operation = jest.fn().mockResolvedValue('ok');

      const result = await service.execute(operation, context, options);

      expect(result).toBe('ok');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on second attempt', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('recovered');

      const expectation = expect(
        service.execute(operation, context, options),
      ).resolves.toBe('recovered');
      await jest.runAllTimersAsync();
      await expectation;

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting all attempts', async () => {
      const error = new Error('permanent failure');
      const operation = jest.fn().mockRejectedValue(error);

      const expectation = expect(
        service.execute(operation, context, options),
      ).rejects.toThrow('permanent failure');
      await jest.runAllTimersAsync();
      await expectation;

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry when maxAttempts is 1', async () => {
      const error = new Error('instant fail');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        service.execute(operation, context, {
          maxAttempts: 1,
          baseDelayMs: 100,
          maxDelayMs: 1000,
        }),
      ).rejects.toThrow('instant fail');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('computeDelay', () => {
    it('should return baseDelayMs on the first retry (attempt 1)', () => {
      const delay = service.computeDelay(1, 500, 5000);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(600);
    });

    it('should double the delay on each retry', () => {
      const delay1 = service.computeDelay(1, 500, 10000);
      const delay2 = service.computeDelay(2, 500, 10000);
      expect(delay2).toBeGreaterThanOrEqual(delay1);
    });

    it('should never exceed maxDelayMs + jitter cap', () => {
      const delay = service.computeDelay(10, 500, 1000);
      expect(delay).toBeLessThanOrEqual(1200);
    });
  });
});
