import { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

export const USERS = {
  superadmin: 'a0000000-0000-0000-0000-000000000001',
  viloyat: 'a0000000-0000-0000-0000-000000000002',
  tuman: 'a0000000-0000-0000-0000-000000000003',
  analitik: 'a0000000-0000-0000-0000-000000000004',
  xodim: 'a0000000-0000-0000-0000-000000000005',
  auditor: 'a0000000-0000-0000-0000-000000000006',
  tuman2: 'a0000000-0000-0000-0000-000000000007',
} as const;

export const ORG_T1 = '10000000-0000-0000-0000-000000000101';
export const ORG_T2 = '10000000-0000-0000-0000-000000000102';
export const UNIT_T1 = '00000000-0000-0000-0000-000000000101';
export const UNIT_T2 = '00000000-0000-0000-0000-000000000102';
export const UNIT_V1 = '00000000-0000-0000-0000-000000000010';

const ISSUER = 'https://test-idp.local/realms/govmind';
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

/** Toza test bazasi: migratsiyalar + seed, ilova va auditor rollari. */
export async function createTestDatabase(): Promise<{ appUrl: string; auditorUrl: string; adminUrl: string; drop: () => Promise<void> }> {
  const admin = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/postgres';
  const name = `govmind_api_test_${process.pid}_${Date.now()}`;
  const root = new Client({ connectionString: admin });
  await root.connect();
  await root.query(`CREATE DATABASE ${name}`);
  await root.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'govmind_app') THEN CREATE ROLE govmind_app LOGIN NOBYPASSRLS PASSWORD 'test'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'govmind_auditor') THEN CREATE ROLE govmind_auditor LOGIN NOBYPASSRLS PASSWORD 'test'; END IF;
    ALTER ROLE govmind_app LOGIN PASSWORD 'test'; ALTER ROLE govmind_auditor LOGIN PASSWORD 'test';
  END $$`);
  await root.end();

  const dbUrl = admin.replace(/\/[^/]*$/, `/${name}`);
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const base = join(__dirname, '..', '..', '..', 'database');
  for (const dir of ['migrations', 'seeds']) {
    for (const f of readdirSync(join(base, dir)).filter((x) => x.endsWith('.sql')).sort()) {
      await db.query(readFileSync(join(base, dir, f), 'utf8'));
    }
  }
  await db.end();

  const u = new URL(dbUrl);
  const withUser = (user: string) => `postgresql://${user}:test@${u.hostname}:${u.port || 5432}/${name}`;
  return {
    appUrl: withUser('govmind_app'),
    auditorUrl: withUser('govmind_auditor'),
    adminUrl: dbUrl,
    drop: async () => {
      const c = new Client({ connectionString: admin });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    },
  };
}

export async function setupKeys(): Promise<string> {
  const { publicKey, privateKey: pk } = await generateKeyPair('RS256');
  privateKey = pk;
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const dir = mkdtempSync(join(tmpdir(), 'govmind-jwks-'));
  const file = join(dir, 'jwks.json');
  writeFileSync(file, JSON.stringify({ keys: [jwk] }));
  return file;
}

export async function tokenFor(sub: string, username?: string): Promise<string> {
  return new SignJWT({ preferred_username: username ?? sub })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(ISSUER)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);
}

export type StubHandler = (path: string, body: any) => unknown;

/** AI engine o'rniga test serveri. */
export async function startAiStub(handler: StubHandler): Promise<{ url: string; server: Server; calls: { path: string; body: any }[] }> {
  const calls: { path: string; body: any }[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: any = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        /* multipart */
      }
      if (req.headers['x-internal-token'] !== 'test-internal-token') {
        res.writeHead(401).end();
        return;
      }
      calls.push({ path: req.url ?? '', body });
      const out = handler(req.url ?? '', body);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, calls };
}

export function configureEnv(db: { appUrl: string; auditorUrl: string }, jwksFile: string, aiUrl: string, storageDir: string) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: db.appUrl,
    AUDITOR_DATABASE_URL: db.auditorUrl,
    OIDC_ISSUER_URL: ISSUER,
    OIDC_JWKS_FILE: jwksFile,
    AI_ENGINE_URL: aiUrl,
    AI_ENGINE_TOKEN: 'test-internal-token',
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    STORAGE_DRIVER: 'fs',
    STORAGE_DIR: storageDir,
    GOVMIND_NODE_ROLE: 'regional',
    GOVMIND_NODE_ID: 'node-test-region',
    GOVMIND_ROOT_PATH: 'demo',
    WORKERS_ENABLED: 'false',
    RATE_LIMIT_PER_MINUTE: '100000',
  });
}

export type App = INestApplication;
