import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { isReviewInput } from '../../src/reviews/model.ts';
import { parseSubmission } from '../../src/reviews/submission.ts';
import { clientReviewInputSchema } from '../../src/reviews/schema.ts';

const review = { name: 'Sam', text: 'Lovely cookies', rating: 5 };

test('shared validation preserves raw values and length boundaries', () => {
  for (const [value, expected] of [
    [review, true],
    [{ ...review, name: ' Sam ', text: ' Lovely cookies ' }, true],
    [{ ...review, name: 'x'.repeat(40), text: 'x'.repeat(400) }, true],
    [{ ...review, name: 'x'.repeat(40) + ' ' }, false],
    [{ ...review, text: 'x'.repeat(400) + ' ' }, false],
    [{ ...review, name: '🍪'.repeat(20) }, true],
    [{ ...review, name: '🍪'.repeat(21) }, false],
    [{ ...review, name: '   ' }, false],
    [{ ...review, text: '\t\r\n' }, false],
    [{ ...review, rating: '5' }, false],
    [{ ...review, rating: 1 }, true],
    [{ ...review, rating: 0 }, false],
    [{ ...review, rating: 6 }, false],
    [{ ...review, rating: 1.5 }, false],
    [{ ...review, rating: NaN }, false],
    [{ ...review, rating: Infinity }, false],
    [null, false],
    [[], false],
    [{}, false],
  ]) {
    assert.equal(isReviewInput(value), expected);
    assert.equal(clientReviewInputSchema.safeParse(value).success, expected);
  }
  const spaced = { ...review, name: ' Sam ', text: ' Lovely ' };
  assert.deepEqual(clientReviewInputSchema.parse(spaced), spaced);
});

test('every forbidden ASCII control stays forbidden, including at the end of a name', () => {
  for (const code of [...Array.from({ length: 32 }, (_, i) => i), 127]) {
    const character = String.fromCharCode(code);
    const badName = { ...review, name: `Sam${character}` };
    const text = { ...review, text: `Cookies${character}` };
    assert.equal(isReviewInput(badName), false, `name control ${code}`);
    assert.equal(clientReviewInputSchema.safeParse(badName).success, false);
    assert.equal(
      isReviewInput(text),
      [9, 10, 13].includes(code),
      `text control ${code}`,
    );
    assert.equal(
      clientReviewInputSchema.safeParse(text).success,
      [9, 10, 13].includes(code),
    );
  }
});

test('backend rejects unknown fields while browser metadata remains compatible', () => {
  const extra = { ...review, id: 'ignored', approved: true };
  assert.equal(isReviewInput(extra), false);
  assert.equal(clientReviewInputSchema.safeParse(extra).success, true);
  assert.equal(parseSubmission({ ...extra, turnstileToken: 'token' }), null);
  const polluted = JSON.parse('{"__proto__":{"admin":true}}');
  assert.equal(
    parseSubmission({ ...review, ...polluted, turnstileToken: 'token' }),
    null,
  );
  assert.equal({}.admin, undefined);
});

test('submission schema keeps token bounds and renames only the internal field', () => {
  assert.deepEqual(parseSubmission({ ...review, turnstileToken: 'token' }), {
    ...review,
    verificationToken: 'token',
  });
  for (const token of [undefined, null, '', 42, {}, 'x'.repeat(2049)])
    assert.equal(parseSubmission({ ...review, turnstileToken: token }), null);
  assert.ok(parseSubmission({ ...review, turnstileToken: 'x'.repeat(2048) }));
  assert.equal(
    parseSubmission({ ...review, turnstileToken: '🍪'.repeat(1025) }),
    null,
  );
  assert.equal(
    parseSubmission({
      ...review,
      turnstileToken: 'token',
      verificationToken: 'injected',
    }),
    null,
  );
});
