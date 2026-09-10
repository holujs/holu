import request from 'supertest';
import type { HttpServer } from '@holu/rest';
import { TestRestApplication } from '@holu/rest-testing';

import { AppModule } from '#app/app.module.js';

describe('02-http-error-handler', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  it('GET / should return 200 with JSON body', async () => {
    const { status, body } = await testAgent.get('/');
    expect(status).toBe(200);
    expect(body).toEqual({ message: 'OK' });
  });

  it('GET /not-found should return 404 with structured error', async () => {
    const res = await testAgent.get('/not-found');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Resource not found');
    expect(res.body.code).toBe('RESOURCE_NOT_FOUND');
    expect(res.body.requestId).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-requestid']).toBeDefined();
  });

  it('GET /validation-error should return 422 with structured error', async () => {
    const res = await testAgent.get('/validation-error');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Invalid email format');
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.requestId).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-requestid']).toBeDefined();
  });

  it('GET /unexpected-error should return 500 with generic error (no internal details)', async () => {
    const res = await testAgent.get('/unexpected-error');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.code).toBeUndefined();
    expect(res.body.requestId).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-requestid']).toBeDefined();
  });
});
