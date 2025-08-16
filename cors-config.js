// Improved CORS configuration for production deployment
const corsConfig = {
  origin: function (origin, callback) {
    console.log(CORS check for origin: );
    
    // Allow requests with no origin in development (like mobile apps, Postman, curl)
    if (!origin && process.env.NODE_ENV !== 'production') {
      console.log('CORS allowing no-origin request in development');
      return callback(null, true);
    }
    
    // Define allowed origins with your actual production URLs
    const allowedOrigins = [
      // Local development
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      
      // Production URLs
      'https://damio-kids-frontend.vercel.app',
      'https://damio-kids-admin.vercel.app',
      
      // Environment variables (if set)
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
    ].filter(Boolean); // Remove undefined values
    
    // Handle Vercel preview deployments dynamically
    const isVercelDomain = origin && (
      origin.includes('damio-kids-frontend') ||
      origin.includes('damio-kids-admin') ||
      origin.includes('hichems-projects') ||
      (origin.includes('.vercel.app') && 
       (origin.includes('damio-kids') || origin.includes('hichems')))
    );
    
    // Allow Vercel domains (both production and preview URLs)
    if (isVercelDomain && origin.startsWith('https://')) {
      console.log(CORS allowing Vercel domain: );
      return callback(null, true);
    }
    
    // Check against explicit allowed origins
    if (allowedOrigins.includes(origin)) {
      console.log(CORS allowing known origin: );
      return callback(null, true);
    }
    
    // Allow no origin in production for server-to-server requests
    if (!origin && process.env.NODE_ENV === 'production') {
      console.log('CORS allowing no-origin request in production (server-to-server)');
      return callback(null, true);
    }
    
    // Log for debugging
    console.warn(CORS blocked request from origin: );
    console.log(Allowed origins: );
    
    callback(new Error('Not allowed by CORS policy'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'auth-token',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
  preflightContinue: false
};

module.exports = corsConfig;
