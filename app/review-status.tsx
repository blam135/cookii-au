import { CircleAlert } from 'lucide-react';

export default function ReviewStatus({ error }: { error?: string }) {
  return (
    <output className="review-status">
      {error && (
        <>
          <CircleAlert size={17} aria-hidden="true" />
          {error}
        </>
      )}
    </output>
  );
}
