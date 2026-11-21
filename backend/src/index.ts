import { isConfigured, type Environment } from './config';
export { ReviewsStore } from './reviews/adapters/cloudflare';

async function route(request: Request, env: Environment): Promise<Response> {
  if (new URL(request.url).pathname !== '/reviews')
    return Response.json({}, { status: 404 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!['GET', 'POST'].includes(request.method))
    return Response.json({}, { status: 405 });
  if (!isConfigured(env)) return Response.json({}, { status: 503 });
  if (request.method === 'POST' && env.SUBMISSIONS_ENABLED !== 'true')
    return Response.json({ message: 'Submissions paused.' }, { status: 503 });
  if (
    request.method === 'POST' &&
    request.headers.get('Origin') !== env.ALLOWED_ORIGIN
  )
    return Response.json({}, { status: 403 });
  return env.REVIEWS.get(env.REVIEWS.idFromName('reviews-v1')).fetch(request);
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch {
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
    return result;
  },
} satisfies ExportedHandler<Environment>;
