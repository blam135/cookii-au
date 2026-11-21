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

const requiredSettings = [
  'NOTION_TOKEN',
  'NOTION_DATA_SOURCE_ID',
  'TURNSTILE_SECRET',
  'IP_HASH_SECRET',
  'ALLOWED_ORIGIN',
  'TURNSTILE_HOSTNAME',
] as const satisfies readonly (keyof Environment)[];

export type RequiredSetting = (typeof requiredSettings)[number];

export function missingConfiguration(env: Environment): RequiredSetting[] {
  return requiredSettings.filter((key) => !env[key]);
}
