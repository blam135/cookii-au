import type { Environment } from '../../config';
import type { Review, ReviewInput } from '../model';
import type { ReviewRepository } from '../ports';
import { isReviewInput } from '../model';

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

  constructor(
    env: Pick<Environment, 'NOTION_TOKEN' | 'NOTION_DATA_SOURCE_ID'>,
    fetcher: typeof fetch = fetch,
  ) {
    this.env = env;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
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
        redirect: 'error',
      });
    } catch {
      console.error('notion_transport_failed');
      throw new Error('Notion unavailable');
    }
    if (!response.ok) {
      console.error('notion_request_failed', { status: response.status });
      throw new Error('Notion unavailable');
    }
    try {
      return await response.json<T>();
    } catch {
      console.error('notion_response_invalid');
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
      `/data_sources/${encodeURIComponent(this.env.NOTION_DATA_SOURCE_ID)}/query`,
      {
        page_size: 20,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      },
    );
    if (!Array.isArray(data.results)) throw new Error('Invalid response');
    return data.results
      .map((page) => this.toReview(page))
      .filter((row): row is Review => row !== null);
  }

  async save(input: ReviewInput): Promise<Review[]> {
    const page = await this.request<NotionPage>('/pages', {
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
    const review = this.toReview(page);
    if (!review) throw new Error('Invalid response');
    return [review];
  }
}
