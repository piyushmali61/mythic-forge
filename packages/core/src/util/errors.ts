/** An error whose message is safe to show to end users. `detail` is shown only in developer mode. */
export class UserFacingError extends Error {
  readonly code: string;
  readonly detail: string | undefined;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = 'UserFacingError';
    this.code = code;
    this.detail = detail;
  }
}

export interface DescribedError {
  /** Friendly, non-technical text. */
  message: string;
  /** Technical detail (stack trace etc.) for developer mode and diagnostics. */
  detail: string;
  code: string;
}

export function describeError(error: unknown, fallback = 'Something went wrong.'): DescribedError {
  if (error instanceof UserFacingError) {
    return { message: error.message, detail: error.detail ?? error.stack ?? error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { message: fallback, detail: error.stack ?? `${error.name}: ${error.message}`, code: 'unexpected' };
  }
  return { message: fallback, detail: String(error), code: 'unexpected' };
}
