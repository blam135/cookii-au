import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { missingConfiguration, type Environment } from './config';
import {
  failureReason,
  RequestDiagnostics,
  REQUEST_ID_HEADER,
} from './diagnostics';
import {
  readJsonBody,
  invalidRequestResponse,
  unavailableResponse,
} from './reviews/http';
import { parseSubmission } from './reviews/submission';
export { ReviewsStore } from './reviews/adapters/cloudflare';

type WorkerEnv = {
  Bindings: Environment;
  Variables: { diagnostics: RequestDiagnostics };
};

const app = new Hono<WorkerEnv>({
  // Preserve exact URL-path matching, including encoded paths and trailing slashes.
  getPath: (request) => new URL(request.url).pathname,
});

app.use('*', async (c, next) => {
  const diagnostics = new RequestDiagnostics();
  c.set('diagnostics', diagnostics);
  const started = Date.now();
  await next();
  // Preserve the existing CORS contract on successes, preflights and errors.
  // Origin authorization for POST remains an independent server-side check.
  c.header('Access-Control-Allow-Origin', c.env.ALLOWED_ORIGIN ?? '');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  c.header('Vary', 'Origin');
  c.header('Cache-Control', 'no-store');
  c.header('X-Request-Id', diagnostics.requestId);
  if (c.req.path === '/reviews' && ['GET', 'POST'].includes(c.req.method)) {
    diagnostics.info({
      event: 'reviews_request_completed',
      method: c.req.method as 'GET' | 'POST',
      status: c.res.status,
      durationMs: Date.now() - started,
    });
  }
});

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
    strictTransportSecurity: 'max-age=31536000',
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    referrerPolicy: 'no-referrer',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    // Keep the current policy rather than introducing unrelated Hono defaults.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    xDnsPrefetchControl: false,
    xDownloadOptions: false,
    xPermittedCrossDomainPolicies: false,
    xXssProtection: false,
  }),
);

app.onError((error, c) => {
  c.get('diagnostics').error({
    event: 'reviews_route_failed',
    reason: failureReason(error),
  });
  return unavailableResponse();
});

// Hono normally routes HEAD through GET; our API deliberately supports GET/POST only.
app.use('/reviews', async (c, next) => {
  if (!['GET', 'POST', 'OPTIONS'].includes(c.req.method))
    return c.json({}, 405);
  await next();
});
app.options('/reviews', (c) => c.body(null, 204));
app.get('/reviews', (c) =>
  forwardReviewRequest(c.req.raw, c.env, c.get('diagnostics')),
);
app.post('/reviews', (c) =>
  forwardReviewRequest(c.req.raw, c.env, c.get('diagnostics')),
);
app.notFound((c) => c.json({}, 404));

export default app;

async function forwardReviewRequest(
  request: Request,
  env: Environment,
  diagnostics: RequestDiagnostics,
): Promise<Response> {
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
  // Do not deliver a client-controlled stream to the shared object's lock.
  // Read/validate at the edge, after throttling, before object dispatch.
  let forwarded: Request;
  if (request.method === 'POST') {
    let body: unknown;
    try {
      body = await readJsonBody(request);
      if (!parseSubmission(body)) return invalidRequestResponse();
    } catch (error) {
      const response = invalidRequestResponse(error);
      diagnostics.info({
        event: 'reviews_request_rejected',
        status: response.status,
      });
      return response;
    }
    const headers = new Headers(request.headers);
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    headers.set('Content-Type', 'application/json');
    forwarded = new Request(request, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } else {
    forwarded = new Request(request);
  }
  forwarded.headers.set(REQUEST_ID_HEADER, diagnostics.requestId);
  try {
    const response = await env.REVIEWS.get(
      env.REVIEWS.idFromName('reviews-v1'),
    ).fetch(forwarded);
    // Cloudflare RPC responses have immutable headers; middleware needs a mutable copy.
    return new Response(response.body, response);
  } catch (error) {
    diagnostics.error({
      event: 'reviews_dispatch_failed',
      reason: failureReason(error),
    });
    throw error;
  }
}
