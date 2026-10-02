import request from 'supertest';
import type { HttpServer } from '@holu/rest';
import { TestRestApplication } from '@holu/rest-testing';

import { AppModule } from '#app/app.module.js';

describe('16-openapi-validation', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  const validUser = {
    username: 'Kostia',
    email: 'kostia@example.com',
    age: 30,
  };

  describe('GET /users/:username — path parameter validation', () => {
    it('valid username returns 200', async () => {
      const { status, body } = await testAgent.get('/users/Kostia');
      expect(status).toBe(200);
      expect(body).toEqual({ username: 'Kostia' });
    });

    it('too short username (minLength: 3) returns 400', async () => {
      const { status, body } = await testAgent.get('/users/ab');
      expect(status).toBe(400);
      expect(body.error).toMatch(/fewer than 3 characters/);
    });
  });

  describe('POST /users — required properties', () => {
    it('empty body returns 400 (missing required fields)', async () => {
      const { status, body } = await testAgent.post('/users').set('content-type', 'application/json').send({});
      expect(status).toBe(400);
      expect(body.error).toMatch(/required property/);
    });

    it('all required fields present returns 201', async () => {
      const { status, body } = await testAgent.post('/users').set('content-type', 'application/json').send(validUser);
      expect(status).toBe(201);
      expect(body.user.username).toBe('Kostia');
    });
  });

  describe('POST /users — username validation (minLength: 3, maxLength: 20, pattern)', () => {
    it('too short username returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, username: 'ab' });
      expect(status).toBe(400);
      expect(body.error).toMatch(/username/);
    });

    it('username with invalid characters returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, username: 'user name!' });
      expect(status).toBe(400);
      expect(body.error).toMatch(/username/);
    });
  });

  describe('POST /users — email validation (pattern)', () => {
    it('invalid email returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, email: 'not-an-email' });
      expect(status).toBe(400);
      expect(body.error).toMatch(/email/);
    });
  });

  describe('POST /users — age validation (minimum: 18, maximum: 120)', () => {
    it('age below minimum returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, age: 10 });
      expect(status).toBe(400);
      expect(body.error).toMatch(/age/);
    });

    it('age above maximum returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, age: 200 });
      expect(status).toBe(400);
      expect(body.error).toMatch(/age/);
    });
  });

  describe('POST /users — role validation (enum)', () => {
    it('invalid role returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, role: 'superadmin' });
      expect(status).toBe(400);
      expect(body.error).toMatch(/role/);
    });

    it('valid role is accepted', async () => {
      const { status } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, role: 'admin' });
      expect(status).toBe(201);
    });
  });

  describe('POST /users — tags validation (minItems: 1, uniqueItems)', () => {
    it('empty tags array returns 400 (minItems: 1)', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, tags: [] });
      expect(status).toBe(400);
      expect(body.error).toMatch(/tags/);
    });

    it('duplicate tags returns 400 (uniqueItems)', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, tags: ['dev', 'dev'] });
      expect(status).toBe(400);
      expect(body.error).toMatch(/tags/);
    });

    it('valid tags are accepted', async () => {
      const { status } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, tags: ['dev', 'backend'] });
      expect(status).toBe(201);
    });
  });

  describe('POST /users — nested address validation', () => {
    it('address with missing required city returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, address: { postalCode: '04112' } });
      expect(status).toBe(400);
      expect(body.error).toMatch(/city/);
    });

    it('address with invalid postalCode pattern returns 400', async () => {
      const { status, body } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, address: { city: 'Kyiv', postalCode: 'abc' } });
      expect(status).toBe(400);
      expect(body.error).toMatch(/postalCode/);
    });

    it('valid address is accepted', async () => {
      const { status } = await testAgent
        .post('/users')
        .set('content-type', 'application/json')
        .send({ ...validUser, address: { city: 'Kyiv', postalCode: '04112' } });
      expect(status).toBe(201);
    });
  });
});
