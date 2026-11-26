import { test as base } from '@playwright/test';
import { mock } from 'node:test';

// Keep fetch mocks isolated even when an assertion fails midway through a test.
export const test = base.extend({
  restoreMocks: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture dependencies.
    async ({}, provide) => {
      try {
        await provide();
      } finally {
        mock.restoreAll();
      }
    },
    { auto: true },
  ],
});
