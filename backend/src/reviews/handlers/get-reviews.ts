import { reviewResponse, unavailableResponse } from '../http';
import type { ReviewService } from '../service';
import { RequestDiagnostics } from '../../diagnostics';

export async function handleGetReviews(
  service: ReviewService,
  diagnostics = new RequestDiagnostics(),
): Promise<Response> {
  try {
    return reviewResponse(await service.list(), 200);
  } catch {
    diagnostics.error({ event: 'reviews_read_failed' });
    return unavailableResponse();
  }
}
