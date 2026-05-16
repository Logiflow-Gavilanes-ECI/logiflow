export class RetryExhaustedException extends Error {
  constructor(
    public readonly operationName: string,
    public readonly correlationId: string,
    public readonly attempts: number,
    public readonly lastErrorMessage: string,
    cause: unknown,
  ) {
    super(
      `[${operationName}] exhausted ${attempts} attempt(s) | correlationId: ${correlationId} | lastError: ${lastErrorMessage}`,
    );
    this.name = 'RetryExhaustedException';

    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}
