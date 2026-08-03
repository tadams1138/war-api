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
    jwtSecret: env.JWT_SECRET ?? 'test-secret-do-not-use-in-production',
    jwtIssuer: env.JWT_ISSUER ?? 'war-api',
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri: env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/v1/auth/google/callback',
    },
    internalTaskToken: env.INTERNAL_TASK_TOKEN ?? 'test-internal-token',
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
