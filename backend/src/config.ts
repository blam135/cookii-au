export interface Environment {
  REVIEWS: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  TURNSTILE_HOSTNAME: string;
  NOTION_DATA_SOURCE_ID: string;
  SUBMISSIONS_ENABLED: string;
  NOTION_TOKEN: string;
  TURNSTILE_SECRET: string;
  IP_HASH_SECRET: string;
}

export function isConfigured(env: Environment): boolean {
  return Boolean(
    env.NOTION_TOKEN &&
    env.NOTION_DATA_SOURCE_ID &&
    env.TURNSTILE_SECRET &&
    env.IP_HASH_SECRET &&
    env.ALLOWED_ORIGIN &&
    env.TURNSTILE_HOSTNAME,
  );
}
