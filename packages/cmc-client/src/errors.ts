export type CmcRateScope = "minute" | "daily" | "monthly" | "ip" | "local" | "unknown";

export class CmcError extends Error {
  readonly httpStatus: number | null;
  readonly errorCode: number | null;
  constructor(message: string, httpStatus: number | null = null, errorCode: number | null = null) {
    super(message);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
    this.errorCode = errorCode;
  }
}

export class CmcAuthError extends CmcError {}

export class CmcPlanError extends CmcError {
  readonly endpoint: string;
  constructor(message: string, endpoint: string, httpStatus: number | null, errorCode: number | null) {
    super(message, httpStatus, errorCode);
    this.endpoint = endpoint;
  }
}

export class CmcRateLimitError extends CmcError {
  readonly scope: CmcRateScope;
  readonly retryAfterMs: number | null;
  constructor(message: string, scope: CmcRateScope, retryAfterMs: number | null, httpStatus: number | null = 429, errorCode: number | null = null) {
    super(message, httpStatus, errorCode);
    this.scope = scope;
    this.retryAfterMs = retryAfterMs;
  }
}

export class CmcHttpError extends CmcError {}

export class CmcTimeoutError extends CmcError {
  readonly endpoint: string;
  constructor(endpoint: string, timeoutMs: number) {
    super(`CMC ${endpoint} did not answer within ${timeoutMs}ms`);
    this.endpoint = endpoint;
  }
}

export class CmcSchemaError extends CmcError {
  readonly endpoint: string;
  constructor(endpoint: string, detail: string) {
    super(`CMC ${endpoint} returned an unexpected shape: ${detail}`);
    this.endpoint = endpoint;
  }
}
