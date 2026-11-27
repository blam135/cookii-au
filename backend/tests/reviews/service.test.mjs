import assert from 'node:assert/strict';
import { test } from '../fixtures.mjs';
import { ReviewService } from '../../src/reviews/service.ts';

const row = { id: 'server-id', name: 'Sam', rating: 5, text: 'Lovely cookies' };
const command = {
  name: row.name,
  rating: row.rating,
  text: row.text,
  verificationToken: 'opaque-token',
};

function setup({ allowRead = true, allowSubmit = true, verified = true } = {}) {
  const events = [];
  const state = {
    reserveRead: async () => {
      events.push('reserve-read');
      return allowRead;
    },
    reserveVerifiedSubmission: async () => {
      events.push('reserve-verified');
      return true;
    },
    reserveSubmission: async () => {
      events.push('reserve-submit');
      return allowSubmit;
    },
  };
  const repository = {
    load: async () => {
      events.push('load');
      return [row];
    },
    save: async (input) => {
      events.push('save');
      assert.deepEqual(input, {
        name: row.name,
        rating: row.rating,
        text: row.text,
      });
      return [row];
    },
  };
  const verifier = {
    verify: async (token, ip) => {
      events.push('verify');
      assert.equal(token, 'opaque-token');
      assert.equal(ip, '192.0.2.1');
      return verified;
    },
  };
  return {
    service: new ReviewService(state, repository, verifier),
    events,
  };
}

test('each read reserves capacity before querying the repository', async () => {
  const { service, events } = setup();
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await service.list(1000), {
      kind: 'success',
      reviews: [row],
    });
  }
  assert.deepEqual(events, ['reserve-read', 'load', 'reserve-read', 'load']);
});

test('read quota exhaustion returns a rate-limited outcome before querying', async () => {
  const { service, events } = setup({ allowRead: false });
  assert.deepEqual(await service.list(1000), { kind: 'rate-limited' });
  assert.deepEqual(events, ['reserve-read']);
});

test('submit reserves, verifies and saves in order without forwarding the token', async () => {
  const { service, events } = setup();
  assert.deepEqual(await service.submit(command, '192.0.2.1', 1000), {
    kind: 'success',
    reviews: [row],
  });
  assert.deepEqual(events, [
    'reserve-submit',
    'verify',
    'reserve-verified',
    'save',
  ]);
});

test('submit limit rejects before verification and invalid challenge rejects before save', async () => {
  const blocked = setup({ allowSubmit: false });
  assert.deepEqual(await blocked.service.submit(command, '192.0.2.1'), {
    kind: 'rate-limited',
  });
  assert.deepEqual(blocked.events, ['reserve-submit']);
  const invalid = setup({ verified: false });
  assert.deepEqual(await invalid.service.submit(command, '192.0.2.1'), {
    kind: 'verification-failed',
  });
  assert.deepEqual(invalid.events, ['reserve-submit', 'verify']);
});
