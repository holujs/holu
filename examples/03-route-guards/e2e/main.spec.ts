import request from 'supertest';
import type { HttpServer } from '@holu/rest';
import { TestRestApplication } from '@holu/rest-testing';

import { AppModule } from '#app/app.module.js';

describe('03-route-guards', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  describe('public routes', () => {
    it('GET /articles returns 200 without any token', async () => {
      const { status, body } = await testAgent.get('/articles');
      expect(status).toBe(200);
      expect(body).toHaveLength(2);
    });
  });

  describe('Bearer authentication', () => {
    it('GET /articles/1 without token returns 401', async () => {
      const { status } = await testAgent.get('/articles/1');
      expect(status).toBe(401);
    });

    it('GET /articles/1 with invalid token returns 401', async () => {
      const { status } = await testAgent.get('/articles/1').set('Authorization', 'Bearer invalid');
      expect(status).toBe(401);
    });

    it('GET /articles/1 with valid token returns 200 with user info', async () => {
      const { status, body } = await testAgent.get('/articles/1').set('Authorization', 'Bearer token-viewer');
      expect(status).toBe(200);
      expect(body.author).toMatchObject({ username: 'viewer' });
    });
  });

  describe('permissions (authorization)', () => {
    it('POST /articles with viewer token returns 403 (no write permission)', async () => {
      const { status } = await testAgent.post('/articles').set('Authorization', 'Bearer token-viewer');
      expect(status).toBe(403);
    });

    it('POST /articles with editor token returns 200', async () => {
      const { status, body } = await testAgent.post('/articles').set('Authorization', 'Bearer token-editor');
      expect(status).toBe(200);
      expect(body).toMatchObject({ created: true });
    });

    it('DELETE /articles/1 with editor token returns 403 (no admin permission)', async () => {
      const { status } = await testAgent.delete('/articles/1').set('Authorization', 'Bearer token-editor');
      expect(status).toBe(403);
    });

    it('DELETE /articles/1 with admin token returns 200', async () => {
      const { status, body } = await testAgent.delete('/articles/1').set('Authorization', 'Bearer token-admin');
      expect(status).toBe(200);
      expect(body).toMatchObject({ deleted: true });
    });
  });

  describe('HTTP Basic authentication', () => {
    it('GET /admin/status without credentials returns 401 with WWW-Authenticate header', async () => {
      const res = await testAgent.get('/admin/status');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/Basic/);
    });

    it('GET /admin/status with wrong credentials returns 401', async () => {
      const credentials = Buffer.from('wrong:wrong').toString('base64');
      const { status } = await testAgent.get('/admin/status').set('Authorization', `Basic ${credentials}`);
      expect(status).toBe(401);
    });

    it('GET /admin/status with valid credentials returns 200', async () => {
      const credentials = Buffer.from(`${process.env.BASIC_AUTH_USERNAME}:${process.env.BASIC_AUTH_PASSWORD}`).toString('base64');
      const { status, body } = await testAgent.get('/admin/status').set('Authorization', `Basic ${credentials}`);
      expect(status).toBe(200);
      expect(body.user.username).toBe('demo');
    });
  });
});
