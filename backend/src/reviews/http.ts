import type { ReviewResult } from './model';

class RequestBodyError extends Error {
  constructor(readonly status: 400 | 408 | 413 | 415) {
    super('Invalid review request.');
  }
}

const MAX_BODY_BYTES = 4096;
const BODY_TIMEOUT_MS = 5000;

export async function readJsonBody(
  request: Request,
  timeoutMs = BODY_TIMEOUT_MS,
): Promise<unknown> {
  // Only the representation we actually decode is accepted.
  if (
    !/^application\/json(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/i.test(
      request.headers.get('Content-Type') ?? '',
    ) ||
    !['', 'identity'].includes(
      (request.headers.get('Content-Encoding') ?? '').toLowerCase(),
    )
  )
    throw new RequestBodyError(415);

  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new RequestBodyError(400);
    if (Number(declaredLength) > MAX_BODY_BYTES)
      throw new RequestBodyError(413);
  }
  if (request.signal.aborted) throw new RequestBodyError(400);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError(400);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    const fail = (status: 400 | 408) => {
      reject(new RequestBodyError(status));
      // Cancellation may itself hang or reject. Never wait for untrusted cleanup.
      void reader.cancel().catch(() => {});
    };
    timer = setTimeout(() => fail(408), timeoutMs);
    abort = () => fail(400);
    request.signal.addEventListener('abort', abort, { once: true });
  });

  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      // One deadline for the entire body, not a fresh timer for each chunk.
      const { done, value } = await Promise.race([reader.read(), stop]);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) throw new RequestBodyError(413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    // Reject malformed UTF-8 instead of silently replacing invalid bytes.
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export function invalidRequestResponse(error?: unknown): Response {
  return Response.json(
    { message: 'Invalid review.' },
    { status: error instanceof RequestBodyError ? error.status : 400 },
  );
}

export function reviewResponse(
  result: ReviewResult,
  successStatus: 200 | 201,
): Response {
  switch (result.kind) {
    case 'success':
      return Response.json(result.reviews, { status: successStatus });
    case 'rate-limited':
      return Response.json(
        successStatus === 200
          ? {}
          : { message: 'Review limit reached. Please try later.' },
        { status: 429 },
      );
    case 'verification-failed':
      return Response.json(
        { message: 'Please complete the verification again.' },
        { status: 403 },
      );
  }
}

export function unavailableResponse(): Response {
  return Response.json(
    { message: 'Reviews temporarily unavailable.' },
    { status: 503 },
  );
}
