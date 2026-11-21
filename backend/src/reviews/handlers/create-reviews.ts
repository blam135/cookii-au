import { readJsonBody, reviewResponse, unavailableResponse } from '../http';
import type { ReviewService } from '../service';
import { parseSubmission } from '../submission';

export async function handleCreateReviews(
  request: Request,
  service: ReviewService,
): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      return Response.json({ message: 'Invalid review.' }, { status: 400 });
    }
    const input = parseSubmission(body);
    if (!input) return Response.json({}, { status: 400 });
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return Response.json({}, { status: 403 });
    return reviewResponse(await service.submit(input, ip), 201);
  } catch {
    console.error('reviews_create_failed');
    return unavailableResponse();
  }
}
