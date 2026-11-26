import { z } from 'zod';

// Pure schemas shared with the browser; do not import bindings, secrets or adapters here.
const fields = {
  name: z
    .string()
    .refine((value) => value.length <= 40)
    .refine((value) => value.trim().length > 0)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)),
  text: z
    .string()
    .refine((value) => value.length <= 400)
    .refine((value) => value.trim().length > 0)
    // Tabs and line breaks remain valid in review text.
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    ),
  rating: z.number().int().min(1).max(5),
};

// Preserve JavaScript UTF-16 length limits (including emoji), without trimming or coercing.
// Normalization still happens at save.
export const reviewInputSchema = z.strictObject(fields);
export const reviewSubmissionSchema = reviewInputSchema
  .extend({
    turnstileToken: z
      .string()
      .min(1)
      .refine((value) => value.length <= 2048),
  })
  .transform(({ turnstileToken, ...review }) => ({
    ...review,
    verificationToken: turnstileToken,
  }));

// Browser callers may provide metadata; saveReview explicitly selects outgoing fields.
export const clientReviewInputSchema = z.object(fields);
export const reviewSchema = clientReviewInputSchema.extend({ id: z.string() });

export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
