const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const winstonLogger = require('../utils/logger');
const {
  createSubmission,
  getSubmissionById,
  updateSubmissionProgress,
  listSubmissionsByEvent
} = require('../services/pocketbase');
const { evaluateV3 } = require('../services/calculation_v3');

// Dedicated rate limiter for fast-track anonymous submissions
const fastTrackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 fast-track creations per 15 minutes
  message: { error: 'Too many anonymous submissions created from this IP. Please try again later.' },
  handler: (req, res, next, options) => {
    winstonLogger.warn(`Fast-track rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  }
});

// Middleware for fast-track route check
function checkFastTrackLimiter(req, res, next) {
  if (req.body && req.body.is_anonymous) {
    return fastTrackLimiter(req, res, next);
  }
  next();
}

/* POST /api/v0.3/submissions - Initialize new submission */
router.post('/submissions', checkFastTrackLimiter, async (req, res) => {
  try {
    const { type, is_anonymous, is_observer, subject_name, org_id, event_id, author_id } = req.body;
    
    const record = await createSubmission({
      type: type || 'tb40',
      status: is_anonymous ? 'complete' : 'incomplete',
      current_tier: 'tier_1',
      sequence_number: 1,
      answers: {},
      is_anonymous: Boolean(is_anonymous),
      is_observer: Boolean(is_observer),
      subject_name,
      org_id,
      event_id,
      author_id
    });

    res.status(201).json({
      id: record.id,
      type: record.type,
      status: record.status,
      current_tier: record.current_tier,
      saved: true,
      timestamp: record.created || new Date().toISOString()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* GET /api/v0.3/submissions/:id - Fetch submission progress & halfway report */
router.get('/submissions/:id', async (req, res) => {
  try {
    const record = await getSubmissionById(req.params.id);
    
    // Generate evaluation & halfway report from saved answers
    const evalReq = {
      params: { version: 'v0.3', type: record.type },
      body: {
        answers: record.answers || {},
        is_anonymous: record.is_anonymous,
        is_observer: record.is_observer,
        subject_name: record.subject_name
      }
    };
    const evalResponse = evaluateV3(evalReq);

    res.json({
      id: record.id,
      type: record.type,
      status: record.status,
      current_tier: record.current_tier,
      sequence_number: record.sequence_number || 1,
      answers: record.answers || {},
      saved: true,
      timestamp: record.updated || record.created,
      halfway_report: evalResponse.halfway_report,
      result: record.results || evalResponse.result
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/* POST /api/v0.3/submissions/:id/evaluate - Debounced interaction step evaluate & save */
router.post('/submissions/:id/evaluate', async (req, res) => {
  try {
    const record = await getSubmissionById(req.params.id);
    const incomingSeq = req.body.sequence_number || ((record.sequence_number || 0) + 1);

    // Optimistic Concurrency Control Check
    if (incomingSeq < (record.sequence_number || 0)) {
      return res.status(409).json({
        error: 'Out of order interaction update ignored',
        current_sequence: record.sequence_number
      });
    }

    const updatedAnswers = {
      ...(record.answers || {}),
      ...(req.body.answers || {})
    };

    const evalReq = {
      params: { version: 'v0.3', type: record.type },
      body: {
        answers: updatedAnswers,
        is_anonymous: record.is_anonymous,
        is_observer: record.is_observer,
        subject_name: record.subject_name,
        request_precision: req.body.request_precision
      }
    };
    const evalResponse = evaluateV3(evalReq);

    // Update PocketBase record
    const updatedRecord = await updateSubmissionProgress(req.params.id, {
      answers: updatedAnswers,
      status: evalResponse.status,
      current_tier: evalResponse.next_tier,
      sequence_number: incomingSeq,
      results: evalResponse.result
    });

    res.json({
      id: updatedRecord.id,
      timestamp: updatedRecord.updated || new Date().toISOString(),
      saved: true,
      status: evalResponse.status,
      next_tier: evalResponse.next_tier,
      sequence_number: incomingSeq,
      halfway_report: evalResponse.halfway_report,
      result: evalResponse.result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* PATCH /api/v0.3/submissions/:id/contact - Post-report contact enrichment */
router.patch('/submissions/:id/contact', async (req, res) => {
  try {
    const { email, phone } = req.body;
    const updatedRecord = await updateSubmissionProgress(req.params.id, {
      email,
      phone
    });

    res.json({
      id: updatedRecord.id,
      timestamp: updatedRecord.updated || new Date().toISOString(),
      updated: true,
      contact: {
        email: updatedRecord.email,
        phone: updatedRecord.phone
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* GET /api/v0.3/submissions/:id/share - Public view-only result payload */
router.get('/submissions/:id/share', async (req, res) => {
  try {
    const record = await getSubmissionById(req.params.id);
    res.json({
      id: record.id,
      type: record.type,
      status: record.status,
      is_anonymous: record.is_anonymous,
      is_observer: record.is_observer,
      subject_name: record.is_observer ? record.subject_name : undefined,
      results: record.results,
      created: record.created
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/* GET /api/v0.3/events/:eventId/submissions - Event admin batch export */
router.get('/events/:eventId/submissions', async (req, res) => {
  try {
    const records = await listSubmissionsByEvent(req.params.eventId);
    res.json({
      event_id: req.params.eventId,
      total_submissions: records.length,
      submissions: records
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
