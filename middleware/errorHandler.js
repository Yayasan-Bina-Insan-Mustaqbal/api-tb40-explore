const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  // Log the error
  logger.error(`${status} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, {
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Return standard JSON error response
  res.status(status).json({
    error: true,
    status: status,
    message: message,
    timestamp: new Date().toISOString()
  });
}

module.exports = errorHandler;
