const request = require('supertest');
const app = require('../app');

describe('Children Assessment API (tb40anak)', () => {
  const validData = {
    parts: {
      umum: {
        nama: { lengkap: 'Budi' },
        lahir: { tanggal: '2015-01-01' },
        tanggal: '2026-06-14'
      },
      tb40anak: [
        100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
        100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
        100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
        100, 90, 80, 70, 60, 50, 40, 30, 20, 10
      ]
    }
  };

  test('POST /api/v0.1/tb40anak/calculation should return correct children labels', async () => {
    const response = await request(app)
      .post('/api/v0.1/tb40anak/calculation')
      .send(validData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.message).toBe('Calculation for tb40anak in version v0.1');
    
    const presentation = response.body.parts.tb40.tb40Presentation;
    expect(presentation.definisi_tb40.title).toBe('Apa itu TB40?');
    expect(presentation.kepribadian.title).toBe('Sifat Hebatmu');
    expect(presentation.kepribadian.data).toContain('Halo Budi!');
    expect(presentation.ringkasan_gaya_belajar.title).toBe('Cara Belajar yang Asik');
    expect(presentation.ringkasan_bahasa_hati.title).toBe('Rahasia Membuatmu Senang');
  });

  test('POST /api/v0.1/tb40anak/calculation should work even with tb40 key (fallback)', async () => {
    const fallbackData = JSON.parse(JSON.stringify(validData));
    fallbackData.parts.tb40 = fallbackData.parts.tb40anak;
    delete fallbackData.parts.tb40anak;

    const response = await request(app)
      .post('/api/v0.1/tb40anak/calculation')
      .send(fallbackData)
      .expect(200);

    expect(response.body.message).toBe('Calculation for tb40anak in version v0.1');
  });

  test('POST /api/v0.1/tb40anak/calculation should fail with invalid score count', async () => {
    const invalidData = JSON.parse(JSON.stringify(validData));
    invalidData.parts.tb40anak = [100, 90]; // Only 2 instead of 40

    const response = await request(app)
      .post('/api/v0.1/tb40anak/calculation')
      .send(invalidData)
      .expect(400);

    expect(response.body.error).toContain('Invalid tb40anak data');
  });
});
