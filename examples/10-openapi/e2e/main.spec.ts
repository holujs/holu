import request from 'supertest';
import type { HttpServer } from '@holu/rest';
import { TestRestApplication } from '@holu/rest-testing';

import { AppModule } from '#app/app.module.js';

describe('10-openapi', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  it('controller works with GET', async () => {
    const { status, text } = await testAgent.get('/');
    expect(status).toBe(200);
    expect(text).toBe('Hello, World!\n');
  });

  it('controller works with POST', async () => {
    const { status, text } = await testAgent.post('/');
    expect(status).toBe(200);
    expect(text).toBe('Hello, World!\n');
  });

  it('serves main page for OpenAPI docs', async () => {
    const { status, type } = await testAgent.get('/openapi');
    expect(status).toBe(200);
    expect(type).toBe('text/html');
  });

  it('serves route with JSON response for OpenAPI docs', async () => {
    const { status, type, headers } = await testAgent.get('/openapi.json');
    expect(status).toBe(200);
    expect(type).toBe('application/json');
    expect(Number(headers?.['content-length'])).toBeGreaterThan(0);
  });

  it('serves route that returns JavaScript bundle for OpenAPI docs', async () => {
    const { status, type, headers } = await testAgent.get('/openapi.bundle.js');
    expect(status).toBe(200);
    expect(type).toBe('text/javascript');
    if (headers?.['content-length']) {
      expect(Number(headers?.['content-length'])).toBeGreaterThan(0);
    } else {
      expect(headers?.['transfer-encoding']).toBe('chunked');
    }
  });

  it('serves route with YAML response for OpenAPI docs', async () => {
    const { status, type, headers } = await testAgent.get('/openapi.yaml');
    expect(status).toBe(200);
    expect(type).toBe('text/yaml');
    expect(Number(headers?.['content-length'])).toBeGreaterThan(0);
  });

  it('controller works for resource/:resourceId', async () => {
    const { status, body, type } = await testAgent.get('/resource/123');
    expect(status).toBe(200);
    expect(type).toBe('application/json');
    expect(body).toEqual({ resourceId: '123', body: 'some body for resourceId 123' });
  });

  it('controller works for resource2/:resourceId with meta content', async () => {
    const { status, body, type } = await testAgent.get('/resource2/123');
    expect(status).toBe(200);
    expect(type).toBe('application/json');
    expect(body).toEqual({ resourceId: '123', body: 'some body for resourceId 123' });
  });

  it('guard works', async () => {
    const res1 = await testAgent.get('/second');
    expect(res1.status).toBe(401);
    const res2 = await testAgent.get('/guard');
    expect(res2.status).toBe(401);
  });
});
