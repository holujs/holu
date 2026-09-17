import request from 'supertest';
import type { HttpServer } from '@holu/rest';
import { TestRestApplication } from '@holu/rest-testing';

import { AppModule } from '#app/app.module.js';

describe('04-logger', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  it('should work', async () => {
    const { status, text } = await testAgent.get('/');
    expect(status).toBe(200);
    expect(text).toBe('ok');
  });

  it('should work with winston', async () => {
    const { status } = await testAgent.get('/winston');
    expect(status).toBe(200);
  });

  it('should work with bunyan', async () => {
    const { status } = await testAgent.get('/bunyan');
    expect(status).toBe(200);
  });

  it('should work with pino', async () => {
    const { status } = await testAgent.get('/pino');
    expect(status).toBe(200);
  });
});
