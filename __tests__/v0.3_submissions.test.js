const request = require('supertest');
const app = require('../app');

describe('v0.3 Submissions Router Endpoints', () => {
  let createdSubmissionId = null;

  it('POST /api/v0.3/submissions should create a submission and return unique ID & timestamp', async () => {
    const response = await request(app)
      .post('/api/v0.3/submissions')
      .send({
        type: 'tb40',
        is_observer: true,
        subject_name: 'Budi Test'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.saved).toBe(true);
    expect(response.body.timestamp).toBeDefined();
    createdSubmissionId = response.body.id;
  });

  it('GET /api/v0.3/submissions/:id should return submission state and halfway_report', async () => {
    const response = await request(app).get(`/api/v0.3/submissions/${createdSubmissionId}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(createdSubmissionId);
    expect(response.body.halfway_report).toBeDefined();
    expect(response.body.halfway_report.completion_percentage).toBe(0);
  });

  it('POST /api/v0.3/submissions/:id/evaluate should save step and return updated halfway_report', async () => {
    const response = await request(app)
      .post(`/api/v0.3/submissions/${createdSubmissionId}/evaluate`)
      .send({
        sequence_number: 1,
        answers: {
          tier_1: { introvert: 60, extrovert: 40 }
        }
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.saved).toBe(true);
    expect(response.body.next_tier).toBe('tier_2');
    expect(response.body.halfway_report.completion_percentage).toBe(25);
  });

  it('PATCH /api/v0.3/submissions/:id/contact should enrich submission with email and phone', async () => {
    const response = await request(app)
      .patch(`/api/v0.3/submissions/${createdSubmissionId}/contact`)
      .send({
        email: 'test@insanmustaqbal.or.id',
        phone: '+6281234567890'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.updated).toBe(true);
    expect(response.body.contact.email).toBe('test@insanmustaqbal.or.id');
    expect(response.body.contact.phone).toBe('+6281234567890');
  });

  it('GET /api/v0.3/submissions/:id/share should return public view-only result payload', async () => {
    const response = await request(app).get(`/api/v0.3/submissions/${createdSubmissionId}/share`);
    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(createdSubmissionId);
    expect(response.body.is_observer).toBe(true);
    expect(response.body.subject_name).toBe('Budi Test');
  });

  it('GET /api/v0.3/events/:eventId/submissions should return array of submissions for event', async () => {
    const response = await request(app).get('/api/v0.3/events/event_test_123/submissions');
    expect(response.statusCode).toBe(200);
    expect(response.body.event_id).toBe('event_test_123');
    expect(Array.isArray(response.body.submissions)).toBe(true);
  });
});
