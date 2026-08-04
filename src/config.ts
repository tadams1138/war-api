/**
 * The convenience defaults `loadConfig` supplies so tests never have to set
 * every secret explicitly. Named here so `assertProductionConfig` can refuse
 * to boot a real deployment left on any of them (spec §5/§12: auth must not
 * be silently disabled).
 */
export const DEFAULT_JWT_SECRET = 'test-secret-do-not-use-in-production';
export const DEFAULT_INTERNAL_TASK_TOKEN = 'test-internal-token';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  uiOrigins: string[];
  jwtSecret: string;
  jwtIssuer: string;
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
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? '',
    uiOrigins: (env.UI_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    jwtSecret: env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
    jwtIssuer: env.JWT_ISSUER ?? 'war-api',
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri: env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/v1/auth/google/callback',
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

/**
 * Refuses to let a real deployment boot with a secret left at its test
 * default, or with a required credential unset entirely (spec §5/§12: a
 * misconfigured deployment must fail loudly, not serve traffic with auth
 * effectively disabled). `loadConfig` itself stays permissive so it remains
 * convenient for tests; only the real process entry point calls this.
 */
export function assertProductionConfig(config: AppConfig): void {
  const problems: string[] = [];

  if (!config.jwtSecret || config.jwtSecret === DEFAULT_JWT_SECRET) {
    problems.push('JWT_SECRET must be set to a non-default value');
  }
  if (!config.internalTaskToken || config.internalTaskToken === DEFAULT_INTERNAL_TASK_TOKEN) {
    problems.push('INTERNAL_TASK_TOKEN must be set to a non-default value');
  }
  if (!config.databaseUrl) {
    problems.push('DATABASE_URL must be set');
  }
  if (!config.google.clientId || !config.google.clientSecret) {
    problems.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start with an invalid production configuration: ${problems.join('; ')}`);
  }
}
