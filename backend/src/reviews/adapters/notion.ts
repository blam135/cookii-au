import { Client, isNotionClientError, ClientErrorCode } from '@notionhq/client';
import type { Environment } from '../../config';
import type { Review, ReviewInput } from '../model';
import type { ReviewRepository } from '../ports';
import { isReviewInput } from '../model';
import {
  failureReason,
  notionErrorCode,
  RequestDiagnostics,
} from '../../diagnostics';

interface NotionText {
  plain_text?: string;
  text?: { content: string };
}
interface NotionPage {
  id: string;
  properties?: {
    Name?: { title: NotionText[] };
    Rating?: { number: number };
    Review?: { rich_text: NotionText[] };
  };
}

export class NotionReviewRepository implements ReviewRepository {
  constructor(
    private readonly env: Pick<
      Environment,
      'NOTION_TOKEN' | 'NOTION_DATA_SOURCE_ID'
    >,
    private readonly fetcher: typeof fetch = fetch,
    private readonly diagnostics = new RequestDiagnostics(),
  ) {}

  private async request<T>(
    operation: 'query' | 'create',
    execute: (client: Client) => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    let status: number | undefined;
    const fetcher = this.fetcher.bind(globalThis);
    const client = new Client({
      auth: this.env.NOTION_TOKEN,
      notionVersion: '2025-09-03',
      retry: false,
      timeoutMs: 8000,
      // SDK logs can include upstream messages; emit only our allowlisted events.
      logger: () => {},
      fetch: async (url, init) => {
        const response = await fetcher(url, {
          ...init,
          // Unlike the SDK's response-header timeout, this also aborts body reads.
          signal: AbortSignal.timeout(8000),
          redirect: 'manual',
        });
        status = response.status;
        if (response.ok)
          this.diagnostics.info({
            event: 'notion_request_completed',
            operation,
            status,
            durationMs: Date.now() - started,
          });
        return response;
      },
    });
    try {
      return await execute(client);
    } catch (error) {
      if (status !== undefined && (status < 200 || status >= 300))
        this.diagnostics.error({
          event: 'notion_request_failed',
          operation,
          status,
          code: notionErrorCode(error),
          durationMs: Date.now() - started,
        });
      else if (status !== undefined)
        this.diagnostics.error({
          event: 'notion_response_invalid',
          operation,
          reason: 'json',
        });
      else
        this.diagnostics.error({
          event: 'notion_transport_failed',
          operation,
          reason:
            isNotionClientError(error) &&
            error.code === ClientErrorCode.RequestTimeout
              ? 'timeout'
              : failureReason(error),
          durationMs: Date.now() - started,
        });
      throw new Error('Notion unavailable');
    }
  }

  private toReview(page: NotionPage): Review | null {
    const properties = page.properties;
    const input = {
      name: properties?.Name?.title
        ?.map((t) => t.plain_text ?? t.text?.content ?? '')
        .join(''),
      rating: properties?.Rating?.number,
      text: properties?.Review?.rich_text
        ?.map((t) => t.plain_text ?? t.text?.content ?? '')
        .join(''),
    };
    return typeof page.id === 'string' && isReviewInput(input)
      ? { id: page.id, ...input }
      : null;
  }

  async load(): Promise<Review[]> {
    const data = await this.request('query', (client) =>
      client.dataSources.query({
        data_source_id: this.env.NOTION_DATA_SOURCE_ID,
        page_size: 20,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      }),
    );
    if (!data || !Array.isArray(data.results)) {
      this.diagnostics.error({
        event: 'notion_response_invalid',
        operation: 'query',
        reason: 'results',
      });
      throw new Error('Invalid response');
    }
    let reviews: Review[];
    try {
      reviews = data.results
        .map((page) => this.toReview(page))
        .filter((row): row is Review => row !== null);
    } catch {
      this.diagnostics.error({
        event: 'notion_response_invalid',
        operation: 'query',
        reason: 'page',
      });
      throw new Error('Invalid response');
    }
    this.diagnostics.info({
      event: 'notion_reviews_loaded',
      rows: reviews.length,
      skipped: data.results.length - reviews.length,
    });
    return reviews;
  }

  async save(input: ReviewInput): Promise<Review[]> {
    const page = await this.request('create', (client) =>
      client.pages.create({
        parent: {
          type: 'data_source_id',
          data_source_id: this.env.NOTION_DATA_SOURCE_ID,
        },
        properties: {
          Name: { title: [{ text: { content: input.name.trim() } }] },
          Rating: { number: input.rating },
          Review: { rich_text: [{ text: { content: input.text.trim() } }] },
        },
      }),
    );
    try {
      const review = this.toReview(page);
      if (!review) throw new Error('Invalid response');
      return [review];
    } catch {
      this.diagnostics.error({
        event: 'notion_response_invalid',
        operation: 'create',
        reason: 'page',
      });
      throw new Error('Invalid response');
    }
  }
}
