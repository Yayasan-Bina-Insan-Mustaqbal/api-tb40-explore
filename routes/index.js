var express = require('express');
var path = require('path');
var fs = require('fs');
var router = express.Router();
var { handleCalculation } = require('../services/calculation');
var { evaluateV2 } = require('../services/calculation_v2');
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

// v0.2 specific endpoints (must come before the generic one to match correctly)
router.get('/api/:version/:type/schema', validateParams, (req, res, next) => {
  if (req.params.version !== 'v0.2') return next();
  const { type, version } = req.params;
  const schemaPath = path.join(__dirname, `../api/${version}/${type}/questions.json`);
  if (fs.existsSync(schemaPath)) {
    res.json(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
  } else {
    res.status(404).json({ error: 'Schema not found for this type' });
  }
});

router.post('/api/:version/:type/evaluate', validateParams, (req, res, next) => {
  if (req.params.version !== 'v0.2') return next();
  try {
    res.json(evaluateV2(req));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generic calculation endpoint (v0.1 and v0.2)
router.post('/api/:version/:type/calculation', validateParams, validateRequestBody, (req, res) => {
  res.json(handleCalculation(req));
});

module.exports = router;
