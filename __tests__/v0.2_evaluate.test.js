const request = require('supertest');
const app = require('../app');

describe('v0.2 Short Version Assessment API', () => {
  test('GET /api/v0.2/tb40/schema should return tier structure', async () => {
    const response = await request(app)
      .get('/api/v0.2/tb40/schema')
      .expect(200);

    expect(response.body).toHaveProperty('tiers');
    expect(response.body.tiers).toHaveProperty('tier_1');
    expect(response.body.tiers.tier_1.type).toBe('allocation');
    expect(response.body.tiers.tier_2.type).toBe('forced_ranking');
  });

  test('POST /api/v0.2/tb40/evaluate - Step 1: Request Tier 1', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({})
      .expect(200);

    expect(response.body.status).toBe('incomplete');
    expect(response.body.next_tier).toBe('tier_1');
    expect(response.body.dimensions[0].id).toBe('introvert');
  });

  test('POST /api/v0.2/tb40/evaluate - Step 2: Answer Tier 1, Request Tier 2', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({ answers: { tier_1: { introvert: 70, extrovert: 30 } } })
      .expect(200);

    expect(response.body.status).toBe('incomplete');
    expect(response.body.next_tier).toBe('tier_2');
    expect(response.body.dimensions[0].id).toBe('karsa');
  });

  test('POST /api/v0.2/tb40/evaluate - Step 3: Answer Tier 2, Complete with Default Scores', async () => {
    const response = await request(app)
      .post('/api/v0.2/tb40/evaluate')
      .send({ 
        answers: { 
          tier_1: { introvert: 70, extrovert: 30 },
          tier_2: ['karsa', 'cipta', 'rasa']
        } 
      })
      .expect(200);

    expect(response.body.status).toBe('complete');
    expect(response.body.result).toHaveProperty('ranked_categories');
    expect(response.body.result).toHaveProperty('default_scores');
    expect(response.body.result.ranked_categories.length).toBe(6);
    expect(response.body.result.default_scores.length).toBe(40);

    // Pekerja Keras (introvert * karsa) should be 0.7 * 0.7 = 0.49 (Rank 1 -> 90)
    expect(response.body.result.ranked_categories[0].id).toBe('bekerja_keras');
    // Check if some score is 90
    expect(response.body.result.default_scores.includes(90)).toBe(true);
  });
});

