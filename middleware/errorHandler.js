const mongoose = require('mongoose');

// Enhanced error logging
const logError = (error, req) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const userAgent = req.get('user-agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;
  
  console.error(`
=== ERROR LOG ===
Timestamp: ${timestamp}
Method: ${method}
URL: ${url}
IP: ${ip}
User-Agent: ${userAgent}
Error Name: ${error.name}
Error Message: ${error.message}
Stack Trace: ${error.stack}
=================
  `);
};

// Format validation errors from mongoose
const handleValidationError = (error) => {
  const errors = {};
  
  Object.keys(error.errors).forEach(key => {
    errors[key] = error.errors[key].message;
  });
  
  return {
    success: false,
    error: 'Validation Error',
    message: 'Please check your input data',
    details: errors,
    statusCode: 400
  };
};

// Format duplicate key errors from mongoose
const handleDuplicateKeyError = (error) => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  
  return {
    success: false,
    error: 'Duplicate Entry',
    message: `${field} '${value}' already exists`,
    field: field,
    value: value,
    statusCode: 409
  };
};

// Format cast errors from mongoose (e.g., invalid ObjectId)
const handleCastError = (error) => {
  return {
    success: false,
    error: 'Invalid ID Format',
    message: `Invalid ${error.path}: ${error.value}`,
    field: error.path,
    value: error.value,
    statusCode: 400
  };
};

// Handle JWT errors
const handleJWTError = (error) => {
  let message = 'Authentication failed';
  
  if (error.name === 'JsonWebTokenError') {
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    message = 'Token has expired';
  }
  
  return {
    success: false,
    error: 'Authentication Error',
    message: message,
    statusCode: 401
  };
};

// Handle Multer errors (file upload)
const handleMulterError = (error) => {
  let message = 'File upload error';
  let statusCode = 400;
  
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File size too large';
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      break;
    case 'LIMIT_PART_COUNT':
      message = 'Too many parts';
      break;
    case 'LIMIT_FIELD_KEY':
      message = 'Field name too long';
      break;
    case 'LIMIT_FIELD_VALUE':
      message = 'Field value too long';
      break;
    case 'LIMIT_FIELD_COUNT':
      message = 'Too many fields';
      break;
    default:
      message = error.message || 'File upload error';
  }
  
  return {
    success: false,
    error: 'Upload Error',
    message: message,
    statusCode: statusCode
  };
};

// Handle MongoDB connection errors
const handleMongoError = (error) => {
  let message = 'Database error';
  let statusCode = 500;
  
  if (error.name === 'MongoNetworkError') {
    message = 'Database connection failed';
  } else if (error.name === 'MongoTimeoutError') {
    message = 'Database operation timed out';
  } else if (error.name === 'MongoWriteConcernError') {
    message = 'Database write operation failed';
  }
  
  return {
    success: false,
    error: 'Database Error',
    message: message,
    statusCode: statusCode
  };
};

// Handle rate limiting errors
const handleRateLimitError = (error) => {
  return {
    success: false,
    error: 'Rate Limit Exceeded',
    message: 'Too many requests, please try again later',
    retryAfter: error.resetTime,
    statusCode: 429
  };
};

// Main error handling middleware
const errorHandler = (error, req, res, next) => {
  // Log the error
  logError(error, req);
  
  let formattedError;
  
  // Handle different types of errors
  if (error.name === 'ValidationError') {
    formattedError = handleValidationError(error);
  } else if (error.code === 11000) {
    formattedError = handleDuplicateKeyError(error);
  } else if (error.name === 'CastError') {
    formattedError = handleCastError(error);
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    formattedError = handleJWTError(error);
  } else if (error.name === 'MulterError') {
    formattedError = handleMulterError(error);
  } else if (error.name && error.name.startsWith('Mongo')) {
    formattedError = handleMongoError(error);
  } else if (error.type === 'entity.too.large') {
    formattedError = {
      success: false,
      error: 'Request Too Large',
      message: 'Request body too large',
      statusCode: 413
    };
  } else if (error.type === 'entity.parse.failed') {
    formattedError = {
      success: false,
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON',
      statusCode: 400
    };
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    formattedError = {
      success: false,
      error: 'Service Unavailable',
      message: 'External service temporarily unavailable',
      statusCode: 503
    };
  } else {
    // Generic error handling
    formattedError = {
      success: false,
      error: error.name || 'Internal Server Error',
      message: error.message || 'Something went wrong',
      statusCode: error.statusCode || error.status || 500
    };
  }
  
  // Add request information in development
  if (process.env.NODE_ENV === 'development') {
    formattedError.requestInfo = {
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      params: req.params,
      query: req.query,
      headers: req.headers
    };
    
    // Include stack trace in development
    if (error.stack) {
      formattedError.stack = error.stack;
    }
  }
  
  // Send error response
  res.status(formattedError.statusCode).json(formattedError);
};

// 404 Not Found handler
const notFoundHandler = (req, res) => {
  const error = {
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    statusCode: 404,
    suggestions: [
      'Check the URL spelling',
      'Verify the HTTP method (GET, POST, PUT, DELETE)',
      'Check API documentation for correct endpoints'
    ]
  };
  
  if (process.env.NODE_ENV === 'development') {
    error.availableRoutes = {
      products: ['GET /allproducts', 'POST /addproduct', 'POST /removeproduct'],
      auth: ['POST /login', 'POST /signup'],
      orders: ['POST /placeorder', 'GET /admin/orders'],
      categories: ['GET /categories', 'POST /admin/categories'],
      media: ['POST /upload', 'GET /shop-images'],
      health: ['GET /health']
    };
  }
  
  console.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json(error);
};

// Async error wrapper to catch errors in async route handlers
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error class for application-specific errors
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Specific error classes
class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

// Database connection error handler
const handleDatabaseConnection = () => {
  // Handle MongoDB connection events
  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
  });
  
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
  
  mongoose.connection.on('reconnected', () => {
    console.info('MongoDB reconnected');
  });
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
};

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  
  // Close server gracefully
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  
  // Close server gracefully
  process.exit(1);
});

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleDatabaseConnection,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
};
