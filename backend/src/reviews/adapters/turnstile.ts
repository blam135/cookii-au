import type { Environment } from '../../config';
import type { ChallengeVerifier } from '../ports';

interface ChallengeResult {
  success: boolean;
  hostname?: string;
  action?: string;
}

export class TurnstileVerifier implements ChallengeVerifier {
  private readonly env: Pick<
    Environment,
    'TURNSTILE_SECRET' | 'TURNSTILE_HOSTNAME'
  >;
  private readonly fetcher: typeof fetch;

  constructor(
    env: Pick<Environment, 'TURNSTILE_SECRET' | 'TURNSTILE_HOSTNAME'>,
    fetcher: typeof fetch = fetch,
  ) {
    this.env = env;
    this.fetcher = fetcher;
  }

  async verify(token: string, ip: string): Promise<boolean> {
    const response = await this.fetcher(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: this.env.TURNSTILE_SECRET,
          response: token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      },
    );
    if (!response.ok) throw new Error('Verification unavailable');
    const result = await response.json<ChallengeResult>();
    return (
      result.success === true &&
      result.hostname === this.env.TURNSTILE_HOSTNAME &&
      result.action === 'review'
    );
  }
}
