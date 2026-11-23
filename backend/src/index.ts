import { missingConfiguration, type Environment } from './config';
import {
  failureReason,
  RequestDiagnostics,
  REQUEST_ID_HEADER,
} from './diagnostics';
export { ReviewsStore } from './reviews/adapters/cloudflare';

async function route(
  request: Request,
  env: Environment,
  diagnostics: RequestDiagnostics,
): Promise<Response> {
  if (new URL(request.url).pathname !== '/reviews')
    return Response.json({}, { status: 404 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!['GET', 'POST'].includes(request.method))
    return Response.json({}, { status: 405 });
  const missing = missingConfiguration(env);
  if (missing.length) {
    diagnostics.error({ event: 'reviews_configuration_missing', missing });
    return Response.json({}, { status: 503 });
  }
  if (request.method === 'POST' && env.SUBMISSIONS_ENABLED !== 'true') {
    diagnostics.info({ event: 'reviews_submissions_paused' });
    return Response.json({ message: 'Submissions paused.' }, { status: 503 });
  }
  if (
    request.method === 'POST' &&
    request.headers.get('Origin') !== env.ALLOWED_ORIGIN
  )
    return Response.json({}, { status: 403 });
  if (!env.REVIEWS) {
    diagnostics.error({ event: 'reviews_binding_missing' });
    throw new Error('Reviews binding unavailable');
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return Response.json({}, { status: 403 });
  const limiter =
    request.method === 'GET'
      ? env.REVIEW_READ_LIMITER
      : env.REVIEW_WRITE_LIMITER;
  // Fail closed if deployment omitted a required protection.
  if (!limiter) return Response.json({}, { status: 503 });
  if (!(await limiter.limit({ key: ip })).success) {
    diagnostics.info({
      event: 'reviews_edge_rate_limited',
      method: request.method,
    });
    return Response.json({}, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const forwarded = new Request(request);
  forwarded.headers.set(REQUEST_ID_HEADER, diagnostics.requestId);
  try {
    return await env.REVIEWS.get(env.REVIEWS.idFromName('reviews-v1')).fetch(
      forwarded,
    );
  } catch (error) {
    diagnostics.error({
      event: 'reviews_dispatch_failed',
      reason: failureReason(error),
    });
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    // Always replace client IDs with a fresh ID before crossing the object boundary.
    const diagnostics = new RequestDiagnostics();
    const started = Date.now();
    let response: Response;
    try {
      response = await route(request, env, diagnostics);
    } catch (error) {
      diagnostics.error({
        event: 'reviews_route_failed',
        reason: failureReason(error),
      });
      response = Response.json(
        { message: 'Reviews temporarily unavailable.' },
        { status: 503 },
      );
    }
    const result = new Response(response.body, response);
    result.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN ?? '');
    result.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    result.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    result.headers.set('Vary', 'Origin');
    result.headers.set('Cache-Control', 'no-store');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    result.headers.set('X-Frame-Options', 'DENY');
    result.headers.set('Referrer-Policy', 'no-referrer');
    result.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    result.headers.set('Strict-Transport-Security', 'max-age=31536000');
    result.headers.set('X-Request-Id', diagnostics.requestId);
    if (
      new URL(request.url).pathname === '/reviews' &&
      (request.method === 'GET' || request.method === 'POST')
    )
      diagnostics.info({
        event: 'reviews_request_completed',
        method: request.method,
        status: result.status,
        durationMs: Date.now() - started,
      });
    return result;
  },
} satisfies ExportedHandler<Environment>;
