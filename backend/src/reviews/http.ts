import type { ReviewResult } from './model';

export async function readJsonBody(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get('Content-Type') ?? '',
    )
  )
    throw new Error('Invalid type');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) {
      await reader.cancel();
      throw new Error('Too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
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
