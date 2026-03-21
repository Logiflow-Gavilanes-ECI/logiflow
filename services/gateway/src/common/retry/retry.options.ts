export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

export const SOCKET_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 200,
  maxDelayMs: 2000,
};
