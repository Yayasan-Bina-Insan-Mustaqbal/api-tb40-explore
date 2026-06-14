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
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  handler: (req, res, next, options) => {
    winstonLogger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});


var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// Security Hardening
app.use(helmet()); // Basic security headers
app.use(cors()); // Allow public access (CORS *)
app.use('/api/', limiter); // Apply rate limiting to API routes


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Enable compression
app.use(compression());

// HTTP Request Logging (Morgan + Winston)
app.use(logger('combined', { stream: { write: message => winstonLogger.info(message.trim()) } }));

// Swagger Documentation
const swaggerDocument = YAML.load(path.join(__dirname, 'public/api/swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
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
