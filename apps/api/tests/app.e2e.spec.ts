import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';

describe('API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health is public', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('protected endpoints are denied by default', async () => {
    await request(app.getHttpServer()).get('/api/v1/organizations').expect(401);
  });

  it('unknown routes return 404', async () => {
    await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
  });
});
