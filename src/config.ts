/**
 * The convenience defaults `loadConfig` supplies so tests never have to set
 * every secret explicitly. Named here so `assertProductionConfig` can refuse
 * to boot a real deployment left on any of them (spec §5/§12: auth must not
 * be silently disabled).
 */
export const DEFAULT_JWT_SECRET = 'test-secret-do-not-use-in-production';
export const DEFAULT_INTERNAL_TASK_TOKEN = 'test-internal-token';

/**
 * The local-dev default for `apiBaseUrl`, port-dependent so it can't be a
 * plain identity constant like `DEFAULT_JWT_SECRET`. Shared by `loadConfig`
 * and `assertProductionConfig` so the two can't drift apart.
 */
export function defaultPublicBaseUrl(port: number): string {
  return `http://localhost:${port}`;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  uiOrigins: string[];
  jwtSecret: string;
  jwtIssuer: string;
  /**
   * This API's own public base URL (env `PUBLIC_BASE_URL`) — named
   * `apiBaseUrl`, not `publicBaseUrl`, to avoid colliding with the
   * differently-scoped `s3.publicBaseUrl` below (the media CDN's origin).
   */
  apiBaseUrl: string;
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  internalTaskToken: string;
  s3: {
    endpoint: string | undefined;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3000);
  const apiBaseUrl = env.PUBLIC_BASE_URL ?? defaultPublicBaseUrl(port);

  return {
    port,
    databaseUrl: env.DATABASE_URL ?? '',
    uiOrigins: (env.UI_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    jwtSecret: env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
    jwtIssuer: env.JWT_ISSUER ?? 'war-api',
    apiBaseUrl,
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri: `${apiBaseUrl}/api/v1/auth/google/callback`,
    },
    internalTaskToken: env.INTERNAL_TASK_TOKEN ?? DEFAULT_INTERNAL_TASK_TOKEN,
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east-1',
      bucket: env.S3_BUCKET ?? 'war-media-dev',
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
      publicBaseUrl: env.S3_PUBLIC_BASE_URL ?? 'http://localhost:9000/war-media-dev',
    },
  };
}

/** True when `value` parses as an absolute `http:`/`https:` URL. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Each production-readiness rule as data rather than an inline `if`, so
 * adding a rule (as this file has already had to do twice) means adding an
 * array entry, not editing a function body (Open/Closed).
 */
const PRODUCTION_RULES: ReadonlyArray<{ failsWhen: (config: AppConfig) => boolean; problem: string }> = [
  {
    failsWhen: (config) => !config.jwtSecret || config.jwtSecret === DEFAULT_JWT_SECRET,
    problem: 'JWT_SECRET must be set to a non-default value',
  },
  {
    failsWhen: (config) => !config.internalTaskToken || config.internalTaskToken === DEFAULT_INTERNAL_TASK_TOKEN,
    problem: 'INTERNAL_TASK_TOKEN must be set to a non-default value',
  },
  {
    failsWhen: (config) => !config.databaseUrl,
    problem: 'DATABASE_URL must be set',
  },
  {
    failsWhen: (config) => !config.google.clientId || !config.google.clientSecret,
    problem: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set',
  },
  {
    failsWhen: (config) => !config.apiBaseUrl || config.apiBaseUrl === defaultPublicBaseUrl(config.port),
    problem: 'PUBLIC_BASE_URL must be set to a non-default value',
  },
  {
    // Only judges shape once a real (non-empty) value is present -- the rule
    // above already owns "missing entirely", so this stays a single concern:
    // a present PUBLIC_BASE_URL whose shape would break the derived
    // google.redirectUri (e.g. a trailing slash doubling the `/` before
    // `api/v1/...`, which Google's exact redirect_uri match rejects outright).
    failsWhen: (config) =>
      config.apiBaseUrl !== '' && (config.apiBaseUrl.endsWith('/') || !isAbsoluteHttpUrl(config.apiBaseUrl)),
    problem: 'PUBLIC_BASE_URL must not end with a trailing slash and must be an absolute http(s) URL',
  },
];

/**
 * Refuses to let a real deployment boot with a secret left at its test
 * default, or with a required credential unset entirely (spec §5/§12: a
 * misconfigured deployment must fail loudly, not serve traffic with auth
 * effectively disabled). `loadConfig` itself stays permissive so it remains
 * convenient for tests; only the real process entry point calls this.
 */
export function assertProductionConfig(config: AppConfig): void {
  const problems = PRODUCTION_RULES.filter((rule) => rule.failsWhen(config)).map((rule) => rule.problem);

  if (problems.length > 0) {
    throw new Error(`Refusing to start with an invalid production configuration: ${problems.join('; ')}`);
  }
}
