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

function setup({
  cache,
  allowRead = true,
  allowSubmit = true,
  verified = true,
} = {}) {
  const events = [];
  const state = {
    getCache: async () => cache,
    setCache: async (value) => {
      events.push('cache');
      cache = value;
    },
    reserveRead: async () => {
      events.push('reserve-read');
      return allowRead;
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
    state,
    events,
  };
}

test('fresh cached reviews need no quota reservation or provider call', async () => {
  const { service, events } = setup({ cache: { rows: [row], expires: 2000 } });
  assert.deepEqual(await service.list(1000), {
    kind: 'success',
    reviews: [row],
  });
  assert.deepEqual(events, []);
});

test('list reserves capacity before loading and persists the shared cache', async () => {
  const { service, state, events } = setup();
  assert.deepEqual(await service.list(1000), {
    kind: 'success',
    reviews: [row],
  });
  assert.deepEqual(events, ['reserve-read', 'load', 'cache']);
  assert.deepEqual(await state.getCache(), { rows: [row], expires: 61000 });
});

test('read limit serves stale cache or a rate-limited outcome without provider access', async () => {
  for (const cache of [undefined, { rows: [row], expires: 0 }]) {
    const { service, events } = setup({ cache, allowRead: false });
    assert.deepEqual(
      await service.list(1000),
      cache ? { kind: 'success', reviews: [row] } : { kind: 'rate-limited' },
    );
    assert.deepEqual(events, ['reserve-read']);
  }
});

test('submit reserves, verifies and saves in order; token never reaches repository', async () => {
  const old = { ...row, id: 'older-review' };
  const { service, state, events } = setup({
    cache: { rows: [old], expires: 2000 },
  });
  assert.deepEqual(await service.submit(command, '192.0.2.1', 1000), {
    kind: 'success',
    reviews: [row],
  });
  assert.deepEqual(events, ['reserve-submit', 'verify', 'save', 'cache']);
  assert.deepEqual(await state.getCache(), { rows: [row, old], expires: 2000 });
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
