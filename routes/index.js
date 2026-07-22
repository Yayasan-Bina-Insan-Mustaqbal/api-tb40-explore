var express = require('express');
var path = require('path');
var fs = require('fs');
var router = express.Router();
var { handleCalculation } = require('../services/calculation');
var { evaluateV2 } = require('../services/calculation_v2');
var { evaluateV3, processSchemaForUser } = require('../services/calculation_v3');
var submissionsRouter = require('./submissions');
var validateParams = require('../middleware/validateParams');
var validateRequestBody = require('../middleware/validateRequestBody');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/* Health check endpoint */
router.get('/health', function(req, res) {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Mount v0.3 Submissions Router
router.use('/api/v0.3', submissionsRouter);

// Version specific schema endpoints
router.get('/api/:version/:type/schema', validateParams, (req, res, next) => {
  const { type, version } = req.params;
  if (!['v0.2', 'v0.3'].includes(version)) return next();
  
  const schemaPath = path.join(__dirname, `../api/${version}/${type}/questions.json`);
  if (fs.existsSync(schemaPath)) {
    const rawSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    if (version === 'v0.3') {
      const isObserver = req.query.is_observer === 'true';
      const subjectName = req.query.subject_name || req.query.nama;
      return res.json(processSchemaForUser(rawSchema, isObserver, subjectName, type));
    }
    res.json(rawSchema);
  } else {
    res.status(404).json({ error: 'Schema not found for this type' });
  }
});

// Version specific evaluate endpoints
router.post('/api/:version/:type/evaluate', validateParams, (req, res, next) => {
  const { version } = req.params;
  if (!['v0.2', 'v0.3'].includes(version)) return next();
  try {
    if (version === 'v0.3') {
      return res.json(evaluateV3(req));
    }
    res.json(evaluateV2(req));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generic calculation endpoint (v0.1, v0.2, and v0.3)
router.post('/api/:version/:type/calculation', validateParams, validateRequestBody, (req, res) => {
  res.json(handleCalculation(req));
});

module.exports = router;
