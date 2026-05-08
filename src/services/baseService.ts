/**
 * Base Service Class
 * Provides common patterns for all services:
 * - Structured logging
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Error standardization
 */

export type ServiceErrorLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ServiceError {
  message: string;
  code?: string;
  originalError?: unknown;
  retries?: number;
  timeout?: boolean;
}

export class BaseService {
  protected serviceName: string;
  protected isDev = process.env.NODE_ENV !== 'production';

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Structured logging with environment awareness
   */
  protected log(message: string, level: ServiceErrorLevel = 'info', data?: any) {
    const prefix = `[${this.serviceName}]`;
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${prefix} ${message}`;

    // Only log info/debug in dev
    if (!this.isDev && (level === 'debug' || level === 'info')) {
      return;
    }

    const logData = data ? ` | ${JSON.stringify(data)}` : '';

    switch (level) {
      case 'debug':
        console.debug(logMessage, logData);
        break;
      case 'info':
        console.info(logMessage, logData);
        break;
      case 'warn':
        console.warn(logMessage, logData);
        break;
      case 'error':
        console.error(logMessage, logData);
        break;
    }
  }

  /**
   * Execute async operation with retry logic and exponential backoff
   * @example
   * const result = await this.withRetry(
   *   () => fetchData(),
   *   { maxRetries: 3, delayMs: 1000 }
   * );
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      delayMs?: number;
      backoffMultiplier?: number;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      delayMs = 1000,
      backoffMultiplier = 2,
    } = options;

    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.log(`Attempt ${attempt + 1}/${maxRetries}`, 'debug');
        return await fn();
      } catch (err) {
        lastError = err;
        const isLastAttempt = attempt === maxRetries - 1;

        if (!isLastAttempt) {
          const delay = delayMs * Math.pow(backoffMultiplier, attempt);
          this.log(`Retry failed, waiting ${delay}ms before retry`, 'warn', {
            attempt: attempt + 1,
            error: String(err),
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.log(`All ${maxRetries} retries failed`, 'error', { error: String(lastError) });
    throw this.createError('Max retries exceeded', undefined, lastError, maxRetries);
  }

  /**
   * Execute promise with timeout
   * @example
   * const result = await this.withTimeout(
   *   fetchData(),
   *   { timeoutMs: 30000 }
   * );
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    options: { timeoutMs?: number } = {}
  ): Promise<T> {
    const { timeoutMs = 30000 } = options;

    return Promise.race<T>([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(this.createError('Operation timeout', undefined, undefined, 0, true)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Execute operation with both retry and timeout
   */
  protected async withRetryAndTimeout<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      delayMs?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const { maxRetries, delayMs, timeoutMs } = options;

    return this.withRetry(
      () => this.withTimeout(fn(), { timeoutMs }),
      { maxRetries, delayMs }
    );
  }

  /**
   * Create standardized error object
   */
  protected createError(
    message: string,
    code?: string,
    originalError?: unknown,
    retries?: number,
    timeout = false
  ): ServiceError {
    return {
      message,
      code,
      originalError,
      retries,
      timeout: timeout || undefined,
    };
  }

  /**
   * Extract error message from various error types
   */
  protected getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as any).message);
    }
    return 'Unknown error';
  }

  /**
   * Validate response and throw if not ok
   */
  protected validateResponse(response: Response): Response {
    if (!response.ok) {
      throw this.createError(
        `HTTP ${response.status}: ${response.statusText}`,
        `HTTP_${response.status}`
      );
    }
    return response;
  }

  /**
   * Parse JSON response with error handling
   */
  protected async parseJsonResponse<T>(response: Response): Promise<T> {
    try {
      return await response.json();
    } catch (err) {
      throw this.createError('Failed to parse JSON response', 'JSON_PARSE_ERROR', err);
    }
  }

  /**
   * Debounce function execution
   */
  protected debounce<T extends (...args: any[]) => any>(
    fn: T,
    delayMs: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delayMs);
    };
  }

  /**
   * Throttle function execution
   */
  protected throttle<T extends (...args: any[]) => any>(
    fn: T,
    delayMs: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delayMs) {
        lastCall = now;
        fn(...args);
      }
    };
  }
}
