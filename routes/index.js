// filepath: /workspaces/api-tb40/routes/index.js
var express = require('express');
var path = require('path');
var router = express.Router();
var { handleCalculation } = require('../services/calculation');
var validateParams = require('../middleware/validateParams');
var validateRequestBody = require('../middleware/validateRequestBody');


// Serve static files from the "public" directory
router.use(express.static(path.join(__dirname, 'public')));

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

// API calculation routes
const versions = ['v0.1', 'v0.2'];
const types = ['tb40', 'tb40anak', 'raporkarakter'];

versions.forEach(version => {
  types.forEach(type => {
    router.post(`/api/:version/:type/calculation`, validateParams, validateRequestBody, (req, res) => {
      res.json(handleCalculation(req));
    });
  });
});

module.exports = router;