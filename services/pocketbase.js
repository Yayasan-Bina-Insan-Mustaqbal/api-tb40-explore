const PocketBase = require('pocketbase/cjs');
const winstonLogger = require('../utils/logger');

const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const pb = new PocketBase(pbUrl);

// Disable auto cancellation for concurrent Node requests
pb.autoCancellation(false);

// Memory fallback store for when PocketBase is unreachable (e.g. unit test mode)
const inMemorySubmissions = new Map();
const inMemoryEvents = new Map();
const inMemoryOrgs = new Map();

async function createSubmission(data) {
  const payload = {
    type: data.type || 'tb40',
    status: data.status || 'incomplete',
    current_tier: data.current_tier || 'tier_1',
    sequence_number: data.sequence_number || 1,
    answers: data.answers || {},
    results: data.results || null,
    org_id: data.org_id || null,
    event_id: data.event_id || null,
    author_id: data.author_id || null,
    is_anonymous: Boolean(data.is_anonymous),
    is_observer: Boolean(data.is_observer),
    subject_name: data.subject_name || null,
    birth_date: data.birth_date || null,
    age: data.age !== undefined ? data.age : null,
    email: data.email || null,
    phone: data.phone || null
  };

  try {
    const record = await pb.collection('submissions').create(payload);
    return record;
  } catch (err) {
    winstonLogger.warn(`PocketBase connection unavailable, using in-memory store: ${err.message}`);
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      id,
      ...payload,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    inMemorySubmissions.set(id, record);
    return record;
  }
}

async function getSubmissionById(id) {
  try {
    const record = await pb.collection('submissions').getOne(id);
    return record;
  } catch (err) {
    if (inMemorySubmissions.has(id)) {
      return inMemorySubmissions.get(id);
    }
    throw new Error(`Submission not found: ${id}`);
  }
}

async function updateSubmissionProgress(id, updates) {
  try {
    const record = await pb.collection('submissions').update(id, {
      ...updates,
      updated: new Date().toISOString()
    });
    return record;
  } catch (err) {
    if (inMemorySubmissions.has(id)) {
      const existing = inMemorySubmissions.get(id);
      
      // Optimistic concurrency sequence check
      if (updates.sequence_number && updates.sequence_number < (existing.sequence_number || 0)) {
        winstonLogger.warn(`Out of order update ignored for ${id}: incoming sequence ${updates.sequence_number} < current ${existing.sequence_number}`);
        return existing;
      }

      const updated = {
        ...existing,
        ...updates,
        updated: new Date().toISOString()
      };
      inMemorySubmissions.set(id, updated);
      return updated;
    }
    throw err;
  }
}

async function listSubmissionsByEvent(eventId) {
  try {
    const records = await pb.collection('submissions').getFullList({
      filter: `event_id = "${eventId}"`,
      sort: '-created'
    });
    return records;
  } catch (err) {
    const results = [];
    for (const sub of inMemorySubmissions.values()) {
      if (sub.event_id === eventId) {
        results.push(sub);
      }
    }
    return results;
  }
}

module.exports = {
  pb,
  createSubmission,
  getSubmissionById,
  updateSubmissionProgress,
  listSubmissionsByEvent,
  inMemorySubmissions
};
