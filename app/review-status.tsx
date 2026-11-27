import { CircleAlert, CircleCheck } from 'lucide-react';

export type ReviewFeedback = {
  tone: 'success' | 'error';
  message: string;
};

export default function ReviewStatus({
  feedback,
}: {
  feedback: ReviewFeedback | null;
}) {
  const Icon = feedback?.tone === 'success' ? CircleCheck : CircleAlert;
  return (
    <output className="review-status" data-tone={feedback?.tone}>
      {feedback && (
        <>
          <Icon size={17} aria-hidden="true" />
          {feedback.message}
        </>
      )}
    </output>
  );
}
