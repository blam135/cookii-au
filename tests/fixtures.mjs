import { test as base } from '@playwright/test';
import { mock } from 'node:test';

// Keep fetch mocks isolated even when an assertion fails midway through a test.
export const test = base.extend({
  restoreMocks: [
    async ({}, use) => {
      try {
        await use();
      } finally {
        mock.restoreAll();
      }
    },
    { auto: true },
  ],
});
