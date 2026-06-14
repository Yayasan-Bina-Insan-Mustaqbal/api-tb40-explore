const request = require('supertest');
const app = require('../app');

describe('Health Check API', () => {
  test('GET /health should return 200 OK and uptime', async () => {
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('timestamp');
  });
});
