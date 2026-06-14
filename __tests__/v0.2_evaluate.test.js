const request = require('supertest');
const app = require('../app');

describe('v0.2 Tiered Assessment API', () => {
  test('GET /api/v0.2/tb40/schema should return tier structure', async () => {
    const response = await request(app)
      .get('/api/v0.2/tb40/schema')
      .expect(200);

    expect(response.body).toHaveProperty('tiers');
    expect(response.body.tiers).toHaveProperty('tier_1');
  });

  test('POST /api/v0.2/tb40/evaluate - Step 1: Request Tier 1', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({})
      .expect(200);

    expect(response.body.status).toBe('incomplete');
    expect(response.body.next_tier).toBe('tier_1');
  });

  test('POST /api/v0.2/tb40/evaluate - Step 2: Answer Tier 1, Request Tier 2', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({ answers: { tier_1: 1 } }) // Introvert
      .expect(200);

    expect(response.body.next_tier).toBe('tier_2');
  });

  test('POST /api/v0.2/tb40/evaluate - Step 3: Answer Tier 2, Request Tier 3', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({ answers: { tier_1: 1, tier_2: 1 } }) // Introvert + Karsa (Bekerja Keras)
      .expect(200);

    expect(response.body.status).toBe('analyzing');
    expect(response.body.next_tier).toBe('tier_3');
    expect(response.body.group.id).toBe('bekerja_keras');
    expect(response.body).toHaveProperty('questions');
    expect(response.body.questions.length).toBeGreaterThan(0);
  });

  test('POST /api/v0.2/tb40/evaluate - Step 4: Answer Tier 3, Complete', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({ 
        answers: { 
          tier_1: 1, 
          tier_2: 1,
          tier_3: { q25: 80, q26: 70, q4: 90 }
        } 
      })
      .expect(200);

    expect(response.body.status).toBe('complete');
    expect(response.body.result.primary_group).toBe('Pekerja Keras');
    expect(response.body.result.traits.length).toBe(3);
  });
});
