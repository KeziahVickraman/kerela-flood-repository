import type { Request, Response } from 'express';
import { getCreditsSnapshot, type ErrorCode } from './data.ts';

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  upstreamStatus: number | null;
  retryAfter: number | null;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    upstreamStatus: number | null = null,
    retryAfter: number | null = null
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
    this.retryAfter = retryAfter;
  }
}

export function verifyClassCode(req: Request): void {
  const expected = process.env.CLASS_ACCESS_CODE?.trim();
  if (!expected) return;

  const rawHeader = req.headers['x-class-code'];
  const provided = Array.isArray(rawHeader)
    ? rawHeader[0]?.trim()
    : typeof rawHeader === 'string'
      ? rawHeader.trim()
      : '';

  if (!provided || provided !== expected) {
    throw new ApiError(
      401,
      'missing_or_invalid_class_code',
      'Missing or invalid x-class-code header for this classroom demo.'
    );
  }
}

export function logRouteResult(
  method: string,
  route: string,
  status: number,
  cached: boolean
): void {
  const credits = getCreditsSnapshot();
  console.log(
    `${method} ${route} status=${status} cached=${cached} credits=${credits.creditsUsedToday}/${credits.dailyLimit} (15m:${credits.creditsLast15Min}/${credits.windowLimit})`
  );
}

export function sendApiError(
  req: Request,
  res: Response,
  route: string,
  err: unknown
): void {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited' && err.retryAfter !== null) {
      res.setHeader('Retry-After', String(err.retryAfter));
    }
    logRouteResult(req.method || 'GET', route, err.status, false);
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      upstreamStatus: err.upstreamStatus,
      retryAfter: err.retryAfter,
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  logRouteResult(req.method || 'GET', route, 500, false);
  res.status(500).json({
    error: 'upstream_error',
    message,
    upstreamStatus: null,
    retryAfter: null,
  });
}
