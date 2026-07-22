const request = require('supertest');
const app = require('../app');
const { evaluateV3, processSchemaForUser } = require('../services/calculation_v3');

describe('v0.3 Evaluation Engine & Personalization Tests', () => {
  it('should interpolate {{name}} with subject_name when in observer mode', () => {
    const rawSchema = {
      tiers: {
        tier_1: {
          questions: [
            { id: 'q1', text: 'Text self', text_observer: 'Bagi 100% energi {{name}} antara Introvert' }
          ]
        }
      }
    };
    const processed = processSchemaForUser(rawSchema, true, 'Ahmad', 'tb40');
    expect(processed.tiers.tier_1.questions[0].text).toBe('Bagi 100% energi Ahmad antara Introvert');
  });

  it('should fallback {{name}} to Kamu for kids when name is empty in observer mode', () => {
    const rawSchema = {
      tiers: {
        tier_1: {
          questions: [
            { id: 'q1', text: 'Text self', text_observer: 'Bagi 100% energi {{name}} antara Introvert' }
          ]
        }
      }
    };
    const processed = processSchemaForUser(rawSchema, true, '', 'tb40anak');
    expect(processed.tiers.tier_1.questions[0].text).toBe('Bagi 100% energi Kamu antara Introvert');
  });

  it('should return tier_1 questions when answers is empty', () => {
    const req = {
      params: { version: 'v0.3', type: 'tb40' },
      body: { answers: {} }
    };
    const result = evaluateV3(req);
    expect(result.status).toBe('incomplete');
    expect(result.next_tier).toBe('tier_1');
    expect(result.halfway_report.completion_percentage).toBe(0);
    expect(result.questions).toBeDefined();
    expect(result.saved).toBe(true);
    expect(result.timestamp).toBeDefined();
  });

  it('should return tier_2 questions after tier_1 is answered', () => {
    const req = {
      params: { version: 'v0.3', type: 'tb40' },
      body: {
        answers: {
          tier_1: { introvert: 70, extrovert: 30 }
        }
      }
    };
    const result = evaluateV3(req);
    expect(result.status).toBe('incomplete');
    expect(result.next_tier).toBe('tier_2');
    expect(result.halfway_report.completion_percentage).toBe(25);
  });

  it('should return profile_required after tier_2 if user is anonymous or missing subject_name', () => {
    const req = {
      params: { version: 'v0.3', type: 'tb40' },
      body: {
        is_anonymous: true,
        answers: {
          tier_1: { introvert: 70, extrovert: 30 },
          tier_2: ['karsa', 'cipta', 'rasa']
        }
      }
    };
    const result = evaluateV3(req);
    expect(result.status).toBe('incomplete');
    expect(result.next_tier).toBe('profile_required');
    expect(result.missing_profile).toContain('subject_name');
  });

  it('should return tier_3 Likert questions after tier_2 is answered and profile is provided', () => {
    const req = {
      params: { version: 'v0.3', type: 'tb40' },
      body: {
        subject_name: 'Budi',
        is_anonymous: false,
        answers: {
          tier_1: { introvert: 70, extrovert: 30 },
          tier_2: ['karsa', 'cipta', 'rasa']
        }
      }
    };
    const result = evaluateV3(req);
    expect(result.status).toBe('incomplete');
    expect(result.next_tier).toBe('tier_3');
    expect(result.halfway_report.completion_percentage).toBe(50);
    expect(result.halfway_report.preliminary_results).toBeDefined();
    expect(result.halfway_report.preliminary_results.ranked_categories).toHaveLength(6);
  });

  it('should complete evaluation after tier_3 is answered with Likert ratings', () => {
    const req = {
      params: { version: 'v0.3', type: 'tb40' },
      body: {
        answers: {
          tier_1: { introvert: 70, extrovert: 30 },
          tier_2: ['karsa', 'cipta', 'rasa'],
          tier_3: { sub_1: 5, sub_2: 4, sub_3: 3 }
        }
      }
    };
    const result = evaluateV3(req);
    expect(result.status).toBe('complete');
    expect(result.halfway_report.completion_percentage).toBe(100);
    expect(result.result.ranked_categories).toBeDefined();
    expect(result.result.top_categories).toHaveLength(3);
    expect(result.result.default_scores).toHaveLength(40);
  });

  it('GET /api/v0.3/tb40/schema should return v0.3 schema', async () => {
    const response = await request(app).get('/api/v0.3/tb40/schema');
    expect(response.statusCode).toBe(200);
    expect(response.body.version).toBe('0.3');
    expect(response.body.tiers.tier_1.questions[0].range_labels).toBeDefined();
  });

  it('POST /api/v0.3/tb40/evaluate should execute evaluateV3 endpoint', async () => {
    const response = await request(app)
      .post('/api/v0.3/tb40/evaluate')
      .send({
        subject_name: 'Budi',
        answers: {
          tier_1: { introvert: 80, extrovert: 20 },
          tier_2: ['cipta', 'karsa', 'rasa']
        }
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('incomplete');
    expect(response.body.next_tier).toBe('tier_3');
  });
});
