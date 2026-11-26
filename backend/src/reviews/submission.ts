import { reviewSubmissionSchema, type ReviewSubmission } from './schema';

export function parseSubmission(value: unknown): ReviewSubmission | null {
  const result = reviewSubmissionSchema.safeParse(value);
  return result.success ? result.data : null;
}
