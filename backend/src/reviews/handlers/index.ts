import { Hono } from 'hono';
import type { ReviewService } from '../service';
import { RequestDiagnostics } from '../../diagnostics';
import { handleCreateReviews } from './create-reviews';
import { handleGetReviews } from './get-reviews';

type HandlerEnv = {
  Bindings: { service: ReviewService; diagnostics: RequestDiagnostics };
};
const app = new Hono<HandlerEnv>();
app.use('*', async (c, next) => {
  if (!['GET', 'POST'].includes(c.req.method)) return c.json({}, 405);
  await next();
});
app.get('/reviews', (c) => handleGetReviews(c.env.service, c.env.diagnostics));
app.post('/reviews', (c) =>
  handleCreateReviews(c.req.raw, c.env.service, c.env.diagnostics),
);
app.notFound((c) => c.json({}, 404));
// The Durable Object owns unexpected-error diagnostics; don't use Hono's console logger.
app.onError((error) => {
  throw error;
});

export async function handleReviewRequest(
  request: Request,
  service: ReviewService,
  diagnostics = new RequestDiagnostics(),
): Promise<Response> {
  return app.fetch(request, { service, diagnostics });
}
