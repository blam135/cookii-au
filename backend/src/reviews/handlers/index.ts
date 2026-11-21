import type { ReviewService } from '../service';
import { handleCreateReviews } from './create-reviews';
import { handleGetReviews } from './get-reviews';

export function handleReviewRequest(
  request: Request,
  service: ReviewService,
): Promise<Response> {
  switch (request.method) {
    case 'GET':
      return handleGetReviews(service);
    case 'POST':
      return handleCreateReviews(request, service);
    default:
      return Promise.resolve(Response.json({}, { status: 405 }));
  }
}
