import type { Environment } from '../../config';
import type { ChallengeVerifier } from '../ports';
import { failureReason, RequestDiagnostics } from '../../diagnostics';

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
  private readonly diagnostics: RequestDiagnostics;

  constructor(
    env: Pick<Environment, 'TURNSTILE_SECRET' | 'TURNSTILE_HOSTNAME'>,
    fetcher: typeof fetch = fetch,
    diagnostics = new RequestDiagnostics(),
  ) {
    this.env = env;
    // Workers fetch rejects a class instance as its receiver (Illegal invocation).
    this.fetcher = fetcher.bind(globalThis);
    this.diagnostics = diagnostics;
  }

  async verify(token: string, ip: string): Promise<boolean> {
    let response: Response;
    try {
      response = await this.fetcher(
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
          redirect: 'manual',
        },
      );
    } catch (error) {
      this.diagnostics.error({
        event: 'turnstile_failed',
        reason: failureReason(error),
      });
      throw new Error('Verification unavailable');
    }
    if (!response.ok) {
      this.diagnostics.error({
        event: 'turnstile_failed',
        reason: 'http',
        status: response.status,
      });
      throw new Error('Verification unavailable');
    }
    let result: ChallengeResult;
    try {
      result = await response.json<ChallengeResult>();
      if (!result || typeof result !== 'object')
        throw new Error('Invalid response');
    } catch {
      this.diagnostics.error({ event: 'turnstile_failed', reason: 'json' });
      throw new Error('Verification unavailable');
    }
    if (
      result.success !== true ||
      result.hostname !== this.env.TURNSTILE_HOSTNAME ||
      result.action !== 'review'
    ) {
      this.diagnostics.info({
        event: 'turnstile_rejected',
        reason:
          result.success !== true
            ? 'challenge'
            : result.hostname !== this.env.TURNSTILE_HOSTNAME
              ? 'hostname'
              : 'action',
      });
      return false;
    }
    return true;
  }
}
