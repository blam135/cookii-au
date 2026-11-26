import type { RequiredSetting } from './config';

type FailureReason = 'timeout' | 'aborted' | 'type_error' | 'other';
type Operation = 'query' | 'create';
type DiagnosticEvent =
  | { event: 'reviews_configuration_missing'; missing: RequiredSetting[] }
  | { event: 'reviews_submissions_paused' }
  | { event: 'reviews_edge_rate_limited'; method: string }
  | { event: 'reviews_binding_missing' }
  | { event: 'reviews_request_rejected'; status: number }
  | {
      event:
        | 'reviews_dispatch_failed'
        | 'reviews_route_failed'
        | 'reviews_store_failed';
      reason: FailureReason;
    }
  | { event: 'reviews_read_failed' | 'reviews_create_failed' }
  | {
      event: 'reviews_request_completed';
      method: 'GET' | 'POST';
      status: number;
      durationMs: number;
    }
  | {
      event: 'reviews_storage_failed';
      operation: 'get' | 'put';
      key: 'cache' | 'budget';
      reason: FailureReason;
    }
  | { event: 'reviews_cache_checked'; state: 'missing' | 'fresh' | 'stale' }
  | {
      event: 'reviews_quota_rejected';
      quota:
        | 'attempt_daily'
        | 'read_daily'
        | 'read_interval'
        | 'submission_daily'
        | 'submission_hourly';
    }
  | {
      event: 'notion_transport_failed';
      operation: Operation;
      reason: FailureReason;
      durationMs: number;
    }
  | {
      event: 'notion_request_failed';
      operation: Operation;
      status: number;
      code: NotionErrorCode;
      durationMs: number;
    }
  | {
      event: 'notion_request_completed';
      operation: Operation;
      status: number;
      durationMs: number;
    }
  | {
      event: 'notion_response_invalid';
      operation: Operation;
      reason: 'json' | 'results' | 'page';
    }
  | { event: 'notion_reviews_loaded'; rows: number; skipped: number }
  | {
      event: 'turnstile_failed';
      reason: FailureReason | 'http' | 'json';
      status?: number;
    }
  | {
      event: 'turnstile_rejected';
      reason: 'challenge';
      codes: TurnstileErrorCode[];
    }
  | {
      event: 'turnstile_rejected';
      reason: 'hostname' | 'action';
    };

const turnstileErrorCodeValues = [
  'missing-input-secret',
  'invalid-input-secret',
  'missing-input-response',
  'invalid-input-response',
  'bad-request',
  'timeout-or-duplicate',
  'internal-error',
] as const;
type TurnstileErrorCode = (typeof turnstileErrorCodeValues)[number] | 'unknown';

export function turnstileErrorCodes(value: unknown): TurnstileErrorCode[] {
  if (!Array.isArray(value) || value.length === 0) return ['unknown'];
  // Fixed values only: never log arbitrary upstream strings or response objects.
  return [
    ...new Set(
      value.map(
        (code) =>
          turnstileErrorCodeValues.find((known) => known === code) ?? 'unknown',
      ),
    ),
  ];
}

const notionErrorCodes = [
  'invalid_json',
  'invalid_request_url',
  'invalid_request',
  'validation_error',
  'missing_version',
  'unauthorized',
  'restricted_resource',
  'object_not_found',
  'conflict_error',
  'rate_limited',
  'internal_server_error',
  'bad_gateway',
  'service_unavailable',
  'database_connection_unavailable',
  'gateway_timeout',
] as const;
type NotionErrorCode = (typeof notionErrorCodes)[number] | 'unknown';

export function notionErrorCode(body: unknown): NotionErrorCode {
  const code =
    body && typeof body === 'object' && 'code' in body ? body.code : undefined;
  return notionErrorCodes.find((known) => known === code) ?? 'unknown';
}

export function failureReason(error: unknown): FailureReason {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'AbortError') return 'aborted';
    if (error instanceof TypeError) return 'type_error';
  }
  return 'other';
}

export const REQUEST_ID_HEADER = 'X-Reviews-Request-Id';

export class RequestDiagnostics {
  readonly requestId: string;

  constructor(requestId?: string | null) {
    // Only internally generated UUIDs can be propagated; never echo arbitrary input.
    this.requestId =
      requestId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
        ? requestId
        : crypto.randomUUID();
  }

  info(event: DiagnosticEvent): void {
    console.info({ ...event, requestId: this.requestId });
  }

  error(event: DiagnosticEvent): void {
    console.error({ ...event, requestId: this.requestId });
  }
}
