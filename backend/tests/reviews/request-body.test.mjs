import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { readJsonBody } from '../../src/reviews/http.ts';

function request(body, headers = {}, signal) {
  return new Request('https://api.example/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
    duplex: 'half',
    signal,
  });
}

for (const type of [
  'application/json',
  'application/json; charset=utf-8',
  'application/json; charset="UTF-8"',
]) {
  test(`accepts supported JSON representation: ${type}`, async () => {
    assert.deepEqual(
      await readJsonBody(request('{"text":"café"}', { 'Content-Type': type })),
      { text: 'café' },
    );
  });
}

for (const headers of [
  { 'Content-Type': 'text/plain' },
  { 'Content-Type': 'application/json; charset=utf-16' },
  { 'Content-Type': 'application/json; ignored=value' },
  { 'Content-Encoding': 'gzip' },
  { 'Content-Encoding': 'br' },
]) {
  test(`rejects unsupported representations before reading: ${JSON.stringify(headers)}`, async () => {
    await assert.rejects(readJsonBody(request('{}', headers)), { status: 415 });
  });
}

test('counts actual bytes across chunks without trusting Content-Length', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(2048).fill(32));
      controller.enqueue(new Uint8Array(2049).fill(32));
      controller.close();
    },
  });
  await assert.rejects(
    readJsonBody(request(stream, { 'Content-Length': '2' })),
    { status: 413 },
  );
  assert.deepEqual(await readJsonBody(request('{}' + ' '.repeat(4094))), {});
  await assert.rejects(readJsonBody(request('"' + 'é'.repeat(2048) + '"')), {
    status: 413,
  });
});

test('rejects excessive declared length without waiting for a body', async () => {
  await assert.rejects(
    readJsonBody(request(new ReadableStream(), { 'Content-Length': '4097' })),
    { status: 413 },
  );
});

test('rejects invalid UTF-8 and malformed JSON', async () => {
  await assert.rejects(
    readJsonBody(request(new Uint8Array([34, 0xc3, 0x28, 34]))),
    { status: 400 },
  );
  await assert.rejects(readJsonBody(request('{')), { status: 400 });
});

test('a stalled body times out even if stream cancellation never resolves', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
      return new Promise(() => {});
    },
  });
  await assert.rejects(readJsonBody(request(stream), 20), { status: 408 });
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test('trickling chunks cannot extend the overall deadline', async () => {
  let interval;
  const stream = new ReadableStream({
    start(controller) {
      interval = setInterval(() => controller.enqueue(new Uint8Array([32])), 5);
    },
    cancel() {
      clearInterval(interval);
    },
  });
  try {
    await assert.rejects(readJsonBody(request(stream), 40), { status: 408 });
  } finally {
    clearInterval(interval);
  }
});

test('aborting a client request promptly cancels the body', async () => {
  const abort = new AbortController();
  let cancelled = false;
  const pending = readJsonBody(
    request(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      {},
      abort.signal,
    ),
  );
  abort.abort();
  await assert.rejects(pending, { status: 400 });
  assert.equal(cancelled, true);
});
