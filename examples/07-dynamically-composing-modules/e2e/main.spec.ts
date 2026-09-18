import request from 'supertest';
import { TestRestApplication } from '@holu/rest-testing';
import type { HttpServer } from '@holu/rest';

import { AppModule } from '#app/app.module.js';

describe('07-dynamically-composing-modules', () => {
  let server: HttpServer;
  let testAgent: ReturnType<typeof request>;

  beforeAll(async () => {
    server = await TestRestApplication.createTestApp(AppModule, { allowRuntimeReinit: true }).getServer();
    testAgent = request(server);
  });

  afterAll(() => {
    server?.close();
  });

  it('should respond from the first module', async () => {
    const { status, text } = await testAgent.get('/');
    expect(status).toBe(200);
    expect(text).toBe('first module.\n');
  });

  it('should return 404 for the second module before it is added', async () => {
    const { status } = await testAgent.get('/get-2');
    expect(status).toBe(404);
  });

  it('should dynamically add the second module', async () => {
    const { status, text } = await testAgent.get('/add-2');
    expect(status).toBe(200);
    expect(text).toBe('Successfully imported second module!\n');
  });

  it('should respond from the second module after adding it', async () => {
    const { status, text } = await testAgent.get('/get-2');
    expect(status).toBe(200);
    expect(text).toBe('second module.\n');
  });

  it('should fail to add the third module (misconfigured)', async () => {
    const { status, body, type } = await testAgent.get('/add-3');
    expect(status).toBe(500);
    expect(type).toBe('application/json');
    const expectStr = expect.stringContaining('ThirdModule-DynamicModule failed: this module should have');
    expect(body).toEqual({ error: expectStr, code: 'NormalizationFailure' });
  });

  it('should still respond from the first module after a failed import', async () => {
    const { status, text } = await testAgent.get('/');
    expect(status).toBe(200);
    expect(text).toBe('first module.\n');
  });

  it('should still respond from the second module after a failed import', async () => {
    const { status, text } = await testAgent.get('/get-2');
    expect(status).toBe(200);
    expect(text).toBe('second module.\n');
  });

  it('should dynamically remove the second module', async () => {
    const { status, text } = await testAgent.get('/del-2');
    expect(status).toBe(200);
    expect(text).toBe('Successfully removed second module!\n');
  });

  it('should return 404 for the second module after removing it', async () => {
    const { status } = await testAgent.get('/get-2');
    expect(status).toBe(404);
  });

  it('should still respond from the first module after removing the second', async () => {
    const { status, text } = await testAgent.get('/');
    expect(status).toBe(200);
    expect(text).toBe('first module.\n');
  });
});
