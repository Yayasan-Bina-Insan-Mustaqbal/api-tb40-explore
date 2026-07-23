var createError = require('http-errors');
require('dotenv').config();
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var compression = require('compression');
var helmet = require('helmet');
var cors = require('cors');
var rateLimit = require('express-rate-limit');
var swaggerUi = require('swagger-ui-express');
var YAML = require('yamljs');
var winstonLogger = require('./utils/logger');
var errorHandler = require('./middleware/errorHandler');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 2000, // limit each IP to 2000 requests in dev/test
  message: { error: 'Too many requests, please try again later.' },
  handler: (req, res, next, options) => {
    winstonLogger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});


var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(helmet({ crossOriginResourcePolicy: false })); // Allow cross-origin API requests
app.use(cors()); // Allow CORS *
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/api/', limiter); // Apply rate limiting to API routes
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// Centralized Error Handling
app.use(errorHandler);

module.exports = app;
