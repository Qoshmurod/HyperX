export type NodeLevel = 'central' | 'region' | 'district';

export interface AppConfig {
  port: number;
  nodeId: string;
  nodeLevel: NodeLevel;
  /** Ushbu tugun xizmat qiladigan eng yuqori hudud yo'li (tizim vazifalari uchun doira). */
  rootPath: string;
  databaseUrl: string;
  auditorDatabaseUrl: string;
  oidc: { issuer: string; audience?: string; jwksUrl?: string; jwksFile?: string };
  aiEngine: { url: string; token: string; timeoutMs: number };
  encryptionKey: Buffer;
  storage:
    | { driver: 'fs'; dir: string }
    | { driver: 's3'; endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string };
  smtp?: { host: string; port: number; user?: string; password?: string; from: string; secure: boolean };
  telegram?: { token: string; apiBase: string };
  upstream?: { url: string; token: string };
  metricsToken?: string;
  workersEnabled: boolean;
  webBaseUrl: string;
}

const NODE_LEVELS: Record<string, NodeLevel> = {
  local: 'district',
  district: 'district',
  regional: 'region',
  region: 'region',
  central: 'central',
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeLevel = NODE_LEVELS[env.GOVMIND_NODE_ROLE ?? 'local'];
  if (!nodeLevel) throw new Error(`Unknown GOVMIND_NODE_ROLE: ${env.GOVMIND_NODE_ROLE}`);

  const key = Buffer.from(required(env, 'APP_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes, base64 encoded');

  const storage: AppConfig['storage'] =
    (env.STORAGE_DRIVER ?? 's3') === 'fs'
      ? { driver: 'fs', dir: env.STORAGE_DIR ?? './data/objects' }
      : {
          driver: 's3',
          endpoint: required(env, 'S3_ENDPOINT'),
          bucket: env.S3_BUCKET ?? 'govmind-documents',
          accessKey: required(env, 'S3_ACCESS_KEY'),
          secretKey: required(env, 'S3_SECRET_KEY'),
          region: env.S3_REGION ?? 'us-east-1',
        };

  return {
    port: Number(env.API_PORT ?? 3001),
    nodeId: env.GOVMIND_NODE_ID ?? 'node-dev-1',
    nodeLevel,
    rootPath: env.GOVMIND_ROOT_PATH ?? 'demo',
    databaseUrl: required(env, 'DATABASE_URL'),
    auditorDatabaseUrl: env.AUDITOR_DATABASE_URL ?? required(env, 'DATABASE_URL'),
    oidc: {
      issuer: required(env, 'OIDC_ISSUER_URL'),
      audience: env.OIDC_AUDIENCE || undefined,
      jwksUrl: env.OIDC_JWKS_URL || undefined,
      jwksFile: env.OIDC_JWKS_FILE || undefined,
    },
    aiEngine: {
      url: env.AI_ENGINE_URL ?? 'http://localhost:8000',
      token: required(env, 'AI_ENGINE_TOKEN'),
      timeoutMs: Number(env.AI_ENGINE_TIMEOUT_MS ?? 60_000),
    },
    encryptionKey: key,
    storage,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT ?? 587),
          user: env.SMTP_USER || undefined,
          password: env.SMTP_PASSWORD || undefined,
          from: env.SMTP_FROM ?? 'GovMind AI <noreply@govmind.local>',
          secure: env.SMTP_SECURE === 'true',
        }
      : undefined,
    telegram: env.TELEGRAM_BOT_TOKEN
      ? { token: env.TELEGRAM_BOT_TOKEN, apiBase: env.TELEGRAM_API_BASE ?? 'https://api.telegram.org' }
      : undefined,
    upstream: env.UPSTREAM_SYNC_URL
      ? { url: env.UPSTREAM_SYNC_URL.replace(/\/$/, ''), token: required(env, 'UPSTREAM_SYNC_TOKEN') }
      : undefined,
    metricsToken: env.METRICS_TOKEN || undefined,
    workersEnabled: env.WORKERS_ENABLED !== 'false',
    webBaseUrl: env.WEB_BASE_URL ?? 'http://localhost:3000',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
