import { reviewResponse, unavailableResponse } from '../http';
import type { ReviewService } from '../service';

export async function handleGetReviews(
  service: ReviewService,
): Promise<Response> {
  try {
    return reviewResponse(await service.list(), 200);
  } catch {
    return unavailableResponse();
  }
}
