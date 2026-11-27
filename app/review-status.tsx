import { CircleAlert, CircleCheck, Info } from 'lucide-react';

export type ReviewFeedback = {
  tone: 'info' | 'success' | 'error';
  message: string;
};

const icons = { info: Info, success: CircleCheck, error: CircleAlert };

export default function ReviewStatus({
  feedback,
  className,
}: {
  feedback: ReviewFeedback | null;
  className: string;
}) {
  const Icon = icons[feedback?.tone ?? 'info'];
  return (
    <output className={`review-notice ${className}`} data-tone={feedback?.tone}>
      {feedback && (
        <>
          <Icon size={17} aria-hidden="true" />
          {feedback.message}
        </>
      )}
    </output>
  );
}
