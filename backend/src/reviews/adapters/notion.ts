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
  properties: {
    Name?: { title: NotionText[] };
    Rating?: { number: number };
    Review?: { rich_text: NotionText[] };
  };
}

export class NotionReviewRepository implements ReviewRepository {
  private readonly env: Pick<
    Environment,
    'NOTION_TOKEN' | 'NOTION_DATA_SOURCE_ID'
  >;
  private readonly fetcher: typeof fetch;
  private readonly diagnostics: RequestDiagnostics;

  constructor(
    env: Pick<Environment, 'NOTION_TOKEN' | 'NOTION_DATA_SOURCE_ID'>,
    fetcher: typeof fetch = fetch,
    diagnostics = new RequestDiagnostics(),
  ) {
    this.env = env;
    // Workers fetch rejects a class instance as its receiver (Illegal invocation).
    this.fetcher = fetcher.bind(globalThis);
    this.diagnostics = diagnostics;
  }

  private async request<T>(
    operation: 'query' | 'create',
    path: string,
    body: unknown,
  ): Promise<T> {
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetcher(`https://api.notion.com/v1${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
        redirect: 'manual',
      });
    } catch (error) {
      this.diagnostics.error({
        event: 'notion_transport_failed',
        operation,
        reason: failureReason(error),
        durationMs: Date.now() - started,
      });
      throw new Error('Notion unavailable');
    }
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // Error bodies may be HTML or invalid JSON. Never log their raw contents.
      }
      this.diagnostics.error({
        event: 'notion_request_failed',
        operation,
        status: response.status,
        code: notionErrorCode(body),
        durationMs: Date.now() - started,
      });
      throw new Error('Notion unavailable');
    }
    this.diagnostics.info({
      event: 'notion_request_completed',
      operation,
      status: response.status,
      durationMs: Date.now() - started,
    });
    try {
      return await response.json<T>();
    } catch {
      this.diagnostics.error({
        event: 'notion_response_invalid',
        operation,
        reason: 'json',
      });
      throw new Error('Invalid response');
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
    const data = await this.request<{ results: NotionPage[] }>(
      'query',
      `/data_sources/${encodeURIComponent(this.env.NOTION_DATA_SOURCE_ID)}/query`,
      {
        page_size: 20,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      },
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
    const page = await this.request<NotionPage>('create', '/pages', {
      parent: {
        type: 'data_source_id',
        data_source_id: this.env.NOTION_DATA_SOURCE_ID,
      },
      properties: {
        Name: { title: [{ text: { content: input.name.trim() } }] },
        Rating: { number: input.rating },
        Review: { rich_text: [{ text: { content: input.text.trim() } }] },
      },
    });
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
