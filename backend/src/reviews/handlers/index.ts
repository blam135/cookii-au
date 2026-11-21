import type { ReviewService } from '../service';
import { RequestDiagnostics } from '../../diagnostics';
import { handleCreateReviews } from './create-reviews';
import { handleGetReviews } from './get-reviews';

export function handleReviewRequest(
  request: Request,
  service: ReviewService,
  diagnostics = new RequestDiagnostics(),
): Promise<Response> {
  switch (request.method) {
    case 'GET':
      return handleGetReviews(service, diagnostics);
    case 'POST':
      return handleCreateReviews(request, service, diagnostics);
    default:
      return Promise.resolve(Response.json({}, { status: 405 }));
  }
}
