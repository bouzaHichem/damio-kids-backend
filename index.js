require('dotenv').config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const port = process.env.PORT || 4000;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌐 CORS check for origin:', origin);

    // Allow server-to-server or same-origin requests with no Origin header
    if (!origin) {
      console.log('✅ CORS: Allowing request with no origin (direct API call)');
      return callback(null, true);
    }

    // Explicitly allowed origins (local + production)
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      'https://damio-kids-frontend.vercel.app',
      'https://damio-kids-final-project.vercel.app',
      'https://damio-kids-admin.vercel.app'
    ].filter(Boolean);

    // Allow all Vercel preview URLs for your specific projects (admin/frontend)
    let hostname = null;
    try {
      hostname = new URL(origin).hostname;
    } catch (e) {
      console.warn('⚠️ CORS: Invalid Origin header:', origin);
      return callback(new Error('Not allowed by CORS policy'));
    }

    const isVercelPreview = hostname.endsWith('.vercel.app') && (
      hostname.startsWith('damio-kids-admin-') ||
      hostname.startsWith('damio-kids-frontend-') ||
      hostname.startsWith('damio-kids-final-project-') ||
      hostname.includes('hichems-projects')
    );

    if (allowedOrigins.includes(origin) || isVercelPreview) {
      console.log('✅ CORS: Origin allowed:', origin);
      return callback(null, true);
    }

    // In non-production, be permissive for development
    if (process.env.NODE_ENV !== 'production') {
      console.log('🟡 CORS (dev): Allowing unknown origin:', origin);
      return callback(null, true);
    }

    console.warn('❌ CORS: Blocked request from origin:', origin);
    return callback(new Error('Not allowed by CORS policy'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'auth-token',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

// IMPORTANT: Apply CORS first, before any other middleware that could reject the request
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' })); // Set JSON payload limit

// Rate limiting configuration
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 authentication attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 upload requests per windowMs
  message: {
    error: 'Too many upload requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/', generalLimiter);
app.use('/login', authLimiter);
app.use('/signup', authLimiter);
app.use('/upload', uploadLimiter);
app.use('/upload-multiple', uploadLimiter);

// (moved) CORS is applied above
app.use(cookieParser()); // Parse cookies for admin authentication

// Static file serving with CORS headers for images
app.use('/images', (req, res, next) => {
  // Add CORS headers for images
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cache-Control', 'public, max-age=31536000'); // 1 year cache
  next();
}, express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.error('MONGODB_URI environment variable is not defined');
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ MONGODB_URI is required in production');
        console.error('Please set MONGODB_URI in your Render environment variables');
        console.error('Example: mongodb+srv://username:password@cluster.mongodb.net/damio-kids');
        
        // In production, continue without database for debugging
        console.warn('⚠️ Running without database connection for debugging...');
        return;
      }
      console.warn('Using default local MongoDB connection');
    }
    
    if (mongoURI) {
      await mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 5000,
      });
      
      console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ Running in production without database connection for debugging');
      console.warn('This will cause issues with data operations. Please fix MONGODB_URI.');
      return; // Don't exit in production, allow server to start for debugging
    }
    
    process.exit(1);
  }
};

// Connect to MongoDB
connectDB();

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', function() {
  console.log("MongoDB connection established successfully!");
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'damio-kids',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto' }]
  },
});

// Fallback to memory storage for local development
const memoryStorage = multer.memoryStorage();

// Use Cloudinary storage in production, memory storage for local development
const upload = multer({ 
  storage: process.env.NODE_ENV === 'production' ? storage : memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Single image upload (existing functionality)
app.post("/upload", upload.single('product'), async (req, res) => {
  try {
    // Add CORS headers for image upload response
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (!req.file) {
      return res.status(400).json({ success: 0, message: "No file uploaded" });
    }

    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      // Cloudinary URL
      imageUrl = req.file.path;
    } else {
      // Local development or fallback
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }

    res.json({ success: 1, image_url: imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: 0, message: "Upload failed", error: error.message });
  }
});

// Multiple image upload for product galleries
app.post("/upload-multiple", upload.array('products', 5), async (req, res) => {
  try {
    // Add CORS headers for image upload response
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: 0, message: "No files uploaded" });
    }
    
    let imageUrls;
    if (process.env.NODE_ENV === 'production') {
      // Cloudinary URLs
      imageUrls = req.files.map(file => file.path);
    } else {
      // Local development URLs
      imageUrls = req.files.map(file => `/images/${file.filename || Date.now()}`);
    }
    
    res.json({ success: 1, image_urls: imageUrls });
  } catch (error) {
    console.error('Upload multiple error:', error);
    res.status(500).json({ success: 0, message: "Upload failed", error: error.message });
  }
});

// Authentication middleware
const fetchuser = async (req, res, next) => {
  console.log('🔐 Authentication middleware triggered for:', req.path);
  
  let token = req.header("auth-token");
  
  // Also check for Authorization header with Bearer format
  if (!token) {
    const authHeader = req.header("Authorization") || req.headers.authorization;
    console.log('🔍 Authorization header:', authHeader ? authHeader.substring(0, 20) + '...' : 'not found');
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7); // Remove "Bearer " prefix
      console.log('✅ Token extracted from Bearer header');
    } else if (authHeader && authHeader.startsWith("auth-token ")) {
      token = authHeader.substring(11); // Remove "auth-token " prefix
      console.log('✅ Token extracted from auth-token header');
    } else if (authHeader) {
      token = authHeader; // Sometimes sent without prefix
      console.log('⚠️ Token used from Authorization header without Bearer prefix');
    }
  } else {
    console.log('✅ Token found in auth-token header');
  }
  
  if (!token) {
    console.log('❌ No token provided in request');
    return res.status(401).json({ 
      success: false, 
      errors: "Please authenticate using a valid token" 
    });
  }
  
  // Clean token and add debugging
  token = token.trim().replace(/^"|"$/g, '');
  console.log('🔑 Token length:', token.length, 'starts with:', token.substring(0, 10) + '...');
  
  // Validate JWT_SECRET exists
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('❌ JWT_SECRET environment variable is not defined');
    return res.status(500).json({ 
      success: false, 
      errors: "Server configuration error" 
    });
  }
  
  console.log('🔐 JWT_SECRET is configured, length:', jwtSecret.length);
  
  try {
    console.log('🔓 Attempting to verify token...');
    const data = jwt.verify(token, jwtSecret);
    
    if (!data.user || !data.user.id) {
      console.error('❌ Token verification failed: Invalid token structure');
      return res.status(401).json({
        success: false,
        errors: 'Invalid token format'
      });
    }
    
    req.user = data.user;
    console.log('✅ User authenticated:', data.user.id, 'role:', data.user.role || 'user');
    next();
  } catch (error) {
    console.error('❌ Token verification error:', error.name, error.message);
    
    let errorMessage = 'Invalid or expired token';
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired, please login again';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token format - jwt malformed';
    } else if (error.name === 'NotBeforeError') {
      errorMessage = 'Token not active yet';
    }
    
    return res.status(401).json({ 
      success: false, 
      errors: errorMessage 
    });
  }
};

// Import the proper User model
const Users = require('./models/User');

// Define Product schema explicitly to support indexes and new homepage flags
const productSchemaLite = new mongoose.Schema({
  id: Number,
  name: String,
  description: String,
  image: String,
  images: [String],
  // Category linkage
  category: String,
  subcategory: String,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  subcategoryId: { type: Number, default: null },
  new_price: Number,
  old_price: Number,
  // Product variants
  sizes: [String],
  colors: [String],
  ageRange: {
    min: Number,
    max: Number
  },
  // Additional professional fields
  brand: String,
  material: String,
  care_instructions: String,
  weight: Number,
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  stock_quantity: { type: Number, default: 0 },
  sku: String,
  tags: [String],
  // SEO fields
  meta_title: String,
  meta_description: String,
  // Product status
  status: { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
  featured: { type: Boolean, default: false }, // legacy
  on_sale: { type: Boolean, default: false },  // legacy
  // New homepage flags
  isFeatured: { type: Boolean, default: false, index: true },
  isPromo: { type: Boolean, default: false, index: true },
  isBestSelling: { type: Boolean, default: false, index: true },
  // Collection flags
  newCollection: { type: Boolean, default: false },
  popular: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  avilable: { type: Boolean, default: true }
}, { timestamps: true });

productSchemaLite.index({ featured: 1 });
productSchemaLite.index({ newCollection: 1 });
productSchemaLite.index({ popular: 1 });
productSchemaLite.index({ new_price: 1 });
productSchemaLite.index({ date: -1 });

const Product = mongoose.model('Product', productSchemaLite);

// Use the canonical Order model definition to avoid Mongoose OverwriteModelError
// This ensures the model is registered exactly once across the codebase.
const Order = require('./models/Order');

const DeliveryFee = mongoose.model("DeliveryFee", {
  wilaya: { type: String, required: true },
  commune: { type: String, required: true },
  deliveryType: { type: String, enum: ['home', 'pickup'], required: true },
  fee: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

const Wilaya = mongoose.model("Wilaya", {
  name: { type: String, required: true, unique: true },
  communes: [{ type: String, required: true }],
  date: { type: Date, default: Date.now }
});

const Category = mongoose.model("Category", {
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  bannerImage: { type: String, default: '' },
  subcategories: [{
    id: { type: Number, required: true },
    name: { type: String, required: true }
  }],
  date: { type: Date, default: Date.now }
});

const ShopImage = mongoose.model("ShopImage", {
  id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  image: { type: String, required: true },
  imageType: { type: String, enum: ['hero', 'category', 'promotional', 'feature'], required: true },
  category: { type: String }, // For category images (boys, girls, babies)
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
});

const Collection = mongoose.model("Collection", {
  name: String,
  bannerImage: String,
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isVisible: { type: Boolean, default: true },
  order: Number,
});


// Import admin routes with comprehensive error handling
let adminAuthRoutes = require('express').Router();
let adminSettingsRoutes = require('express').Router();
let requireAdminAuth;
let requirePermission;

// Create fallback middleware functions
const createFallbackAuth = (errorMsg) => (req, res, next) => {
  console.error('Admin auth fallback triggered:', errorMsg);
  return res.status(401).json({ 
    success: false, 
    message: 'Admin authentication unavailable', 
    error: errorMsg 
  });
};

const createFallbackPermission = (errorMsg) => () => (req, res, next) => {
  console.error('Admin permission fallback triggered:', errorMsg);
  return res.status(403).json({ 
    success: false, 
    message: 'Admin permissions unavailable', 
    error: errorMsg 
  });
};

try {
  // Load admin middleware first
  try {
    const adminMiddleware = require('./middleware/adminAuth');
    requireAdminAuth = adminMiddleware.requireAdminAuth;
    requirePermission = adminMiddleware.requirePermission;
    console.log('✅ Admin middleware loaded successfully');
  } catch (middlewareError) {
    console.error('❌ Error loading admin middleware:', middlewareError.message);
    requireAdminAuth = createFallbackAuth('Middleware not available');
    requirePermission = createFallbackPermission('Middleware not available');
  }
  
  // Load admin auth routes
  try {
    adminAuthRoutes = require('./routes/adminAuth');
    console.log('✅ Admin auth routes loaded successfully');
  } catch (authError) {
    console.error('❌ Error loading admin auth routes:', authError.message);
    adminAuthRoutes = require('express').Router();
    adminAuthRoutes.all('*', (req, res) => {
      console.error('Admin auth route fallback for:', req.path);
      res.status(404).json({ 
        success: false, 
        message: 'Admin auth route not available', 
        path: req.path,
        error: authError.message 
      });
    });
  }
  
  // Load admin settings routes
  try {
    adminSettingsRoutes = require('./routes/admin/settings');
    console.log('✅ Admin settings routes loaded successfully');
  } catch (settingsError) {
    console.error('❌ Error loading admin settings routes:', settingsError.message);
    adminSettingsRoutes = require('express').Router();
    adminSettingsRoutes.all('*', (req, res) => {
      console.error('Admin settings route fallback for:', req.path);
      res.status(404).json({ 
        success: false, 
        message: 'Admin settings route not available', 
        path: req.path,
        error: settingsError.message 
      });
    });
  }
  
} catch (error) {
  console.error('❌ Critical error in admin routes setup:', error.message);
  console.error('Stack:', error.stack);
  
  // Ensure fallback functions exist
  requireAdminAuth = requireAdminAuth || createFallbackAuth('Critical error');
  requirePermission = requirePermission || createFallbackPermission('Critical error');
  
  // Ensure fallback routes exist
  adminAuthRoutes.all('*', (req, res) => {
    res.status(500).json({ 
      success: false, 
      message: 'Admin system unavailable', 
      error: error.message 
    });
  });
  
  adminSettingsRoutes.all('*', (req, res) => {
    res.status(500).json({ 
      success: false, 
      message: 'Admin settings unavailable', 
      error: error.message 
    });
  });
}

// Routes
app.get("/", (req, res) => res.send("Damio Kids API - Server is running!"));

// Public contact endpoint (for storefront Contact form)
try {
  const contactRoutes = require('./routes/contact');
  app.use(contactRoutes);
  console.log('✅ Contact route mounted at POST /api/contact');
} catch (e) {
  console.error('❌ Failed to load contact route:', e.message);
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Damio Kids API is running", 
    version: "2.1.1-cors-headers",
    timestamp: new Date().toISOString() 
  });
});

// Admin authentication routes
app.use('/api/admin/auth', adminAuthRoutes);

// Admin settings routes
app.use('/api/admin/settings', adminSettingsRoutes);

// Mount consolidated admin routes (dashboard, products, customers, inventory, deliveryrates, shop-images, notifications, etc.)
try {
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes mounted at /api/admin');
} catch (e) {
  console.error('❌ Failed to load consolidated admin routes:', e.message);
}

// Load and mount comprehensive admin dashboard routes
try {
  const adminDashboardRoutes = require('./routes/admin');
  app.use('/api/admin', adminDashboardRoutes);
  console.log('✅ Admin dashboard routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading admin dashboard routes:', error.message);
  // Create fallback route for admin dashboard
  app.all('/api/admin/*', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin dashboard temporarily unavailable',
      error: error.message
    });
  });
}

// Temporary admin seeding endpoint (remove after use)
app.post('/seed-admin', async (req, res) => {
  try {
    console.log('🌱 Creating admin user via API endpoint...');
    
    const Admin = require('./models/Admin');
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@damiokids.com' });
    
    if (existingAdmin) {
      console.log('⚠️ Admin user already exists');
      return res.status(200).json({
        success: true,
        message: 'Admin user already exists',
        admin: {
          email: existingAdmin.email,
          role: existingAdmin.role,
          isActive: existingAdmin.isActive
        }
      });
    }
    
    // Create new admin
    const adminData = {
      email: 'admin@damiokids.com',
      password: 'AdminPassword123!', // Will be hashed automatically
      firstName: 'Admin',
      lastName: 'User',
      profileIcon: null,
      role: 'super_admin',
      isActive: true
    };
    
    const newAdmin = new Admin(adminData);
    const savedAdmin = await newAdmin.save();
    
    console.log('✅ Admin user created successfully via API!');
    
    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      admin: {
        id: savedAdmin._id,
        email: savedAdmin.email,
        firstName: savedAdmin.firstName,
        lastName: savedAdmin.lastName,
        role: savedAdmin.role,
        isActive: savedAdmin.isActive
      },
      credentials: {
        email: 'admin@damiokids.com',
        password: 'AdminPassword123!'
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin user',
      error: error.message
    });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ success: false, errors: "Email and password are required" });
    }
    
    // Find user by email
    const user = await Users.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, errors: "Invalid credentials" });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ success: false, errors: "Account is deactivated" });
    }
    
    // Verify password using bcrypt
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, errors: "Invalid credentials" });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { user: { id: user._id, role: user.role } },
      process.env.JWT_SECRET
    );
    
    res.json({ 
      success: true, 
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, errors: "Internal server error" });
  }
});

app.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, errors: "All fields are required" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, errors: "Password must be at least 8 characters long" });
    }
    
    // Check if user already exists
    const existingUser = await Users.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, errors: "User already exists" });
    }
    
    // Initialize empty cart
    let cart = {};
    for (let i = 0; i < 300; i++) cart[i] = 0;
    
    // Create new user (password will be hashed automatically by the User model)
    const user = new Users({
      name: username.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      cartData: cart,
      isActive: true,
      emailVerified: false
    });
    
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { user: { id: user._id, role: user.role } },
      process.env.JWT_SECRET
    );
    
    res.json({ 
      success: true, 
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, errors: "Internal server error" });
  }
});

// Products
app.get("/allproducts", async (req, res) => {
  try {
    const products = await Product.find({});
    const categories = await Category.find({});
    
    // Enhance products with resolved category and subcategory information
    const enhancedProducts = products.map(product => {
      const p = product.toObject();

      // Prefer canonical refs when present
      let catDoc = null;
      if (p.categoryId) {
        catDoc = categories.find(c => c._id.toString() === p.categoryId.toString());
      }

      // Legacy: category as ObjectId string stored in category
      if (!catDoc && p.category && /^[0-9a-fA-F]{24}$/.test(p.category)) {
        catDoc = categories.find(c => c._id.toString() === p.category);
        if (catDoc) p.categoryId = catDoc._id;
      }

      // Legacy: category as name
      if (!catDoc && p.category) {
        catDoc = categories.find(c => c.name === p.category);
        if (catDoc) p.categoryId = catDoc._id;
      }

      p.categoryName = catDoc ? catDoc.name : (p.category || null);

      // Resolve subcategory
      let subId = p.subcategoryId;
      if (!subId && typeof p.subcategory === 'string' && /^\d+$/.test(p.subcategory)) {
        subId = parseInt(p.subcategory, 10);
      }
      if (catDoc && subId != null) {
        const sub = (catDoc.subcategories || []).find(s => s.id === Number(subId) || s.name === p.subcategory);
        if (sub) {
          p.subcategoryId = sub.id;
          p.subcategoryName = sub.name;
        }
      } else if (catDoc && p.subcategory && !/^\d+$/.test(p.subcategory)) {
        const sub = (catDoc.subcategories || []).find(s => s.name === p.subcategory);
        if (sub) {
          p.subcategoryId = sub.id;
          p.subcategoryName = sub.name;
        }
      }

      return p;
    });
    
res.send(enhancedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Homepage sections: featured, promo, best-selling (paginated)
app.get('/api/products/featured', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;
    const filter = { status: 'active', avilable: true, $or: [{ isFeatured: true }, { featured: true }] };
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter)
    ]);
    res.json({ success: true, products: items, page, limit, total, hasMore: skip + items.length < total });
  } catch (err) { next(err); }
});

app.get('/api/products/promo', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;
    const filter = { status: 'active', avilable: true, $or: [{ isPromo: true }, { on_sale: true }] };
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter)
    ]);
    res.json({ success: true, products: items, page, limit, total, hasMore: skip + items.length < total });
  } catch (err) { next(err); }
});

app.get('/api/products/best-selling', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;
    const filter = { status: 'active', avilable: true, isBestSelling: true };
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter)
    ]);
    res.json({ success: true, products: items, page, limit, total, hasMore: skip + items.length < total });
  } catch (err) { next(err); }
});

// Advanced Products Search and Filter API
app.get("/products/search", async (req, res) => {
  try {
    const {
      q: searchQuery,
      category,
      categoryId,
      subcategory,
      subcategoryId,
      minPrice,
      maxPrice,
      sizes,
      colors,
      tags,
      brand,
      available,
      sortBy,
      sortOrder,
      page = 1,
      limit = 20
    } = req.query;

    // Build MongoDB query
    let query = { status: 'active' };

    // Category/subcategory filtering
    if (categoryId && /^[0-9a-fA-F]{24}$/.test(categoryId)) {
      query.categoryId = new mongoose.Types.ObjectId(categoryId);
    } else if (category && category !== 'all') {
      // Legacy name-based category
      query.category = new RegExp(category, 'i');
    }

    // Build subcategory filter to support both id and legacy name
    const subOr = [];
    if (subcategoryId && String(subcategoryId).match(/^\d+$/)) {
      subOr.push({ subcategoryId: parseInt(subcategoryId, 10) });
    }
    if (subcategory) {
      subOr.push({ subcategory: new RegExp(subcategory, 'i') });
    }
    if (subOr.length > 0) {
      // Merge with existing query conditions
      if (query.$or) {
        // If a text $or exists, combine using $and
        const existingOr = query.$or;
        delete query.$or;
        query.$and = [ { ...query }, { $or: existingOr }, { $or: subOr } ];
        // After wrapping, remove duplicated plain fields from first element
        delete query.$and[0].$and; // safety
      } else {
        query.$or = subOr;
      }
    }

    // Text search across multiple fields
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, 'i');
      query.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { tags: { $in: [searchRegex] } },
        { category: searchRegex }
      ];
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.new_price = {};
      if (minPrice) query.new_price.$gte = parseInt(minPrice);
      if (maxPrice) query.new_price.$lte = parseInt(maxPrice);
    }

    // Size filter
    if (sizes) {
      const sizeArray = Array.isArray(sizes) ? sizes : sizes.split(',');
      query.sizes = { $in: sizeArray };
    }

    // Color filter
    if (colors) {
      const colorArray = Array.isArray(colors) ? colors : colors.split(',');
      query.colors = { $in: colorArray };
    }

    // Tags filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      query.tags = { $in: tagArray };
    }

    // Brand filter
    if (brand) {
      query.brand = new RegExp(brand, 'i');
    }

    // Availability filter
    if (available !== undefined) {
      query.avilable = available === 'true';
      if (available === 'true') {
        query.stock_quantity = { $gt: 0 };
      }
    }

    // Build sort object
    let sort = {};
    if (sortBy) {
      const order = sortOrder === 'desc' ? -1 : 1;
      switch (sortBy) {
        case 'price':
          sort.new_price = order;
          break;
        case 'name':
          sort.name = order;
          break;
        case 'date':
          sort.date = order;
          break;
        case 'popular':
          sort.popular = -1;
          sort.date = -1;
          break;
        case 'newest':
          sort.date = -1;
          break;
        default:
          sort.date = -1;
      }
    } else {
      sort.date = -1; // Default sort by newest
    }

    // Execute query with pagination
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const [products, totalCount, categories] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(pageSize),
      Product.countDocuments(query),
      Category.find({})
    ]);

    // Enhance products with category information
    const enhancedProducts = products.map(product => {
      const productObj = product.toObject();
      
      if (productObj.category && productObj.category.match(/^[0-9a-fA-F]{24}$/)) {
        const matchingCategory = categories.find(cat => cat._id.toString() === productObj.category);
        if (matchingCategory) {
          productObj.categoryName = matchingCategory.name;
          productObj.categoryId = matchingCategory._id;
        }
      } else {
        productObj.categoryName = productObj.category;
        const matchingCategory = categories.find(cat => cat.name === productObj.category);
        if (matchingCategory) {
          productObj.categoryId = matchingCategory._id;
        }
      }
      
      return productObj;
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    res.json({
      success: true,
      products: enhancedProducts,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalProducts: totalCount,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1
      },
      filters: {
        searchQuery: searchQuery || '',
        category: category || 'all',
        priceRange: {
          min: minPrice ? parseInt(minPrice) : 0,
          max: maxPrice ? parseInt(maxPrice) : null
        },
        sizes: sizes ? (Array.isArray(sizes) ? sizes : sizes.split(',')) : [],
        colors: colors ? (Array.isArray(colors) ? colors : colors.split(',')) : [],
        tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : [],
        brand: brand || '',
        available: available !== undefined ? available === 'true' : null
      },
      sort: {
        sortBy: sortBy || 'newest',
        sortOrder: sortOrder || 'desc'
      }
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unique filter options for advanced filtering
app.get("/products/filters", async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      Product.find({ status: 'active' }),
      Category.find({})
    ]);

    // Extract unique values for filters
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
    const sizes = [...new Set(products.flatMap(p => p.sizes || []))];
    const colors = [...new Set(products.flatMap(p => p.colors || []))];
    const tags = [...new Set(products.flatMap(p => p.tags || []))];
    
    const priceRange = {
      min: Math.min(...products.map(p => p.new_price || 0)),
      max: Math.max(...products.map(p => p.new_price || 0))
    };

    res.json({
      success: true,
      filters: {
        categories: categories.map(c => ({ id: c.id, name: c.name })),
        brands: brands.sort(),
        sizes: sizes.sort(),
        colors: colors.sort(),
        tags: tags.sort(),
        priceRange
      }
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/newcollections", async (req, res) => {
  const products = await Product.find({ newCollection: true });
  res.send(products);
});

app.get("/popularinwomen", async (req, res) => {
  const products = await Product.find({ popular: true });
  res.send(products);
});

app.post("/relatedproducts", async (req, res) => {
  const products = await Product.find({ category: req.body.category });
  res.send(products.slice(0, 4));
});

// Cart (only for logged-in users)
app.post('/addtocart', fetchuser, async (req, res) => {
  const userData = await Users.findById(req.user.id);
  userData.cartData[req.body.itemId] += 1;
  await Users.findByIdAndUpdate(req.user.id, { cartData: userData.cartData });
  res.send("Added");
});

app.post('/removefromcart', fetchuser, async (req, res) => {
  const userData = await Users.findById(req.user.id);
  if (userData.cartData[req.body.itemId] > 0) userData.cartData[req.body.itemId] -= 1;
  await Users.findByIdAndUpdate(req.user.id, { cartData: userData.cartData });
  res.send("Removed");
});

app.post('/getcart', fetchuser, async (req, res) => {
  const userData = await Users.findById(req.user.id);
  res.json(userData.cartData);
});

// Add/remove products
app.post("/addproduct", async (req, res) => {
  try {
    console.log("Received product data:", req.body);
    const products = await Product.find({});
    const id = products.length ? products[products.length - 1].id + 1 : 1;
    const product = new Product({ id, ...req.body });
    console.log("Attempting to save product with ID:", id);
    await product.save();
    console.log("Product saved successfully:", product.name);
    res.json({ success: true });
  } catch (error) {
    console.error("Add Product Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/removeproduct", async (req, res) => {
  await Product.findOneAndDelete({ id: req.body.id });
  res.json({ success: true });
});

// Import Order model and notification services
const DetailedOrder = Order; // alias to the same canonical model
const orderNotificationService = require('./services/orderNotificationService');
const pushNotificationService = require('./services/pushNotificationService');
const webPushService = require('./services/webPushService');
// Initialize Web Push on startup (logs whether keys are present)
try {
  webPushService.configure();
  const wpStatus = webPushService.getStatus();
  if (wpStatus.configured) {
    console.log('✅ Web Push configured (startup)');
  } else {
    console.warn('🟡 Web Push not configured on startup:', wpStatus);
  }
} catch (e) {
  console.warn('🟡 Web Push startup configure error:', e.message);
}

// Provide a helpful response for accidental GETs
app.get('/placeorder', (req, res) => {
  res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST /placeorder.' });
});

// ✅ Place Order (Enhanced with detailed model and email notifications)
app.post("/placeorder", async (req, res) => {
  try {
    console.log('📦 New order placement request:', {
      userId: req.body.userId || 'guest',
      itemCount: req.body.items?.length || 0,
      total: req.body.total
    });
    // Debug logging (safe)
    console.log('📝 Request headers (subset):', {
      'content-type': req.headers['content-type'],
      origin: req.headers['origin'],
      'user-agent': req.headers['user-agent']
    });
    try {
      console.log('📝 Incoming body:', JSON.stringify(req.body));
    } catch (_) {}

    // Backward-compatibility shim: accept legacy payloads from the old storefront
    // and transform into the new schema (customerInfo + shippingAddress).
    (function legacyCompatTransform(body){
      const hasNewShape = body && body.customerInfo && body.shippingAddress;
      if (hasNewShape) return; // nothing to do
      try {
        const addressStr = String(body.address || '');
        // Extract full name (before first comma) and phone (after 'Tel:') when present
        const fullName = (addressStr.split(',')[0] || '').trim() || 'Customer';
        const phoneMatch = addressStr.match(/Tel:\s*([+0-9\-\s()]{6,})/i);
        const phone = (body.telephone || (phoneMatch ? phoneMatch[1] : '')).trim();
        // Address line without the trailing Tel/Notes decorations
        const cleanedAddress = addressStr
          .replace(/Tel:\s*([+0-9\-\s()]{6,})/gi, '')
          .replace(/Notes?:.*$/i, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        body.customerInfo = {
          // Use a safe domain and simple format to satisfy email schema
          email: body.email || `guest.${Date.now()}@damiokids.com`,
          name: fullName,
          phone: phone || '0000000000' // minimal placeholder that passes length checks
        };
        body.shippingAddress = {
          fullName,
          phone: body.customerInfo.phone,
          address: cleanedAddress || `${body.commune || ''}, ${body.wilaya || ''}`.trim(),
          wilaya: body.wilaya || '',
          commune: body.commune || ''
        };
        // Ensure delivery type
        body.deliveryType = body.deliveryType || 'home';
        // Compute subtotal if not provided
        if (body.subtotal == null && Array.isArray(body.items)) {
          body.subtotal = body.items.reduce((sum, it) => sum + Number(it.subtotal || (it.price || 0) * (it.quantity || 0)), 0);
        }
        // Compute total if missing or invalid
        const df = Number(body.deliveryFee || 0);
        const st = Number(body.subtotal || 0);
        if (body.total == null || Number(body.total) <= 0) {
          body.total = st + df;
        }
      } catch (e) {
        console.warn('⚠️ Legacy payload transform failed:', e.message);
      }
    })(req.body || {});

    // Validate required fields
    const { 
      items, 
      subtotal, 
      deliveryFee = 0, 
      total, 
      customerInfo, 
      shippingAddress, 
      deliveryType = 'home',
      paymentMethod = 'cash_on_delivery',
      userId 
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Order must contain at least one item" 
      });
    }

    if (!customerInfo || !customerInfo.email || !customerInfo.name || !customerInfo.phone) {
      return res.status(400).json({ 
        success: false, 
        error: "Customer information (name, email, phone) is required" 
      });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.address || 
        !shippingAddress.wilaya || !shippingAddress.commune || !shippingAddress.phone) {
      return res.status(400).json({ 
        success: false, 
        error: "Complete shipping address is required" 
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Valid order total is required" 
      });
    }

    // Create order with detailed model
    // Compute safe numeric values
    const safeSubtotal = Number(subtotal || items.reduce((sum, item) => sum + (item.subtotal || item.price * item.quantity), 0));
    const safeDelivery = Number(deliveryFee || 0);
    const safeTotal = Number(total);

    const orderData = {
      userId: userId || "guest",
      customerInfo: {
        email: String(customerInfo.email || '').toLowerCase().trim(),
        name: String(customerInfo.name || '').trim(),
        phone: String(customerInfo.phone || '').trim()
      },
      items: items.map(item => ({
        productId: item.productId || item.id,
        name: item.name,
        image: item.image,
        price: Number(item.price),
        quantity: Number(item.quantity),
        size: item.size || '',
        color: item.color || '',
        subtotal: Number(item.subtotal || item.price * item.quantity)
      })),
      subtotal: safeSubtotal,
      deliveryFee: safeDelivery,
      total: isNaN(safeTotal) || safeTotal <= 0 ? (safeSubtotal + safeDelivery) : safeTotal,
      shippingAddress: {
        fullName: String(shippingAddress.fullName || '').trim(),
        phone: String(shippingAddress.phone || '').trim(),
        wilaya: shippingAddress.wilaya,
        commune: shippingAddress.commune,
        address: String(shippingAddress.address || '').trim(),
        postalCode: shippingAddress.postalCode || '',
        notes: shippingAddress.notes || ''
      },
      deliveryType: deliveryType,
      paymentMethod: paymentMethod,
      status: 'pending'
    };

    // Create and save the order
    const order = new DetailedOrder(orderData);
    const savedOrder = await order.save();
    console.log(`✅ Order saved successfully: ${savedOrder.orderNumber}`);

    // Update metrics
    try {
      const Metrics = require('./models/Metrics');
      const m = await getOrInitMetrics();
      m.totalOrders = Number(m.totalOrders || 0) + 1;
      m.updatedAt = new Date();
      await m.save();
      broadcastMetrics(m);
      console.log('📊 Metrics updated successfully');
    } catch(e) { 
      console.warn('⚠️ Metrics update failed (placeorder):', e?.message); 
    }

    // Send notifications (async, non-blocking)
    setImmediate(async () => {
      try {
        console.log('📧 Triggering email notifications...');
        const emailResults = await orderNotificationService.sendNewOrderNotifications(savedOrder);
        console.log('📧 Email notification results:', {
          adminSent: emailResults.adminNotification?.success,
          customerSent: emailResults.customerNotification?.success,
          errors: emailResults.errors
        });

        console.log('📱 Triggering push notifications...');
        const pushResults = await pushNotificationService.sendOrderNotification(savedOrder);
        const webPushResults = await webPushService.sendOrderNotification(savedOrder).catch(() => ({ success: false, total: 0 }));
        console.log('📱 Push notification results:', {
          totalDevices: pushResults.totalDevices,
          successfulSends: pushResults.successfulSends,
          failedSends: pushResults.failedSends,
          errors: pushResults.errors
        });
        console.log('📱 Web Push results:', webPushResults);

      } catch (notificationError) {
        console.error('❌ Notification error (non-blocking):', notificationError.message);
      }
    });

    // Return success response
    res.status(201).json({ 
      success: true, 
      order: {
        id: savedOrder._id,
        orderNumber: savedOrder.orderNumber,
        status: savedOrder.status,
        total: savedOrder.total,
        estimatedDeliveryDate: savedOrder.estimatedDeliveryDate
      },
      message: `Order ${savedOrder.orderNumber} placed successfully! You will receive confirmation emails shortly.`
    });

  } catch (error) {
    console.error('❌ Place order error:', error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to place order", 
      details: error.message 
    });
  }
});

// ===== Metrics (SSE) =====
const sseClients = new Set();

function broadcastMetrics(metricsDoc){
  if (!metricsDoc) return;
  const payload = `event: metrics\ndata: ${JSON.stringify({
    totalRevenue: Number(metricsDoc.totalRevenue || 0),
    totalOrders: Number(metricsDoc.totalOrders || 0),
    updatedAt: metricsDoc.updatedAt
  })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

async function getOrInitMetrics(){
  const Metrics = require('./models/Metrics');
  let m = await Metrics.findById('global');
  if (!m) m = await Metrics.create({ _id: 'global', totalRevenue: 0, totalOrders: 0 });
  return m;
}

app.get('/api/admin/metrics', requireAdminAuth, async (req, res) => {
  const Metrics = require('./models/Metrics');
  const m = await getOrInitMetrics();
  res.json({ success: true, data: { totalRevenue: m.totalRevenue || 0, totalOrders: m.totalOrders || 0, updatedAt: m.updatedAt } });
});

app.get('/api/admin/metrics/stream', requireAdminAuth, async (req, res) => {
  res.set({ 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive' });
  res.flushHeaders && res.flushHeaders();
  res.write(`event: ping\ndata: {"ok":true}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function computeOrderRevenue(order, { includeTax = (order.financials?.includeTaxInRevenue || false), includeShipping = false } = {}){
  const items = order.items || [];
  const sumItems = items.reduce((acc, it) => {
    const price = Number(it.price || 0);
    const qty = Number(it.quantity || 0);
    const itemDisc = Number(it.itemDiscount || 0);
    return acc + Math.max(price - itemDisc, 0) * qty;
  }, 0);
  const orderDiscount = Number(order.financials?.orderDiscount || 0);
  const taxAmount = Number(order.financials?.taxAmount || 0);
  const shippingFee = Number(order.financials?.shippingFee || 0);
  const refunded = Number(order.financials?.refundedAmount || 0);
  let revenue = Math.max(sumItems - orderDiscount, 0);
  if (includeTax) revenue += taxAmount;
  if (includeShipping) revenue += shippingFee;
  revenue = Math.max(revenue - refunded, 0);
  return revenue;
}

// Admin Orders (optional: protect with fetchuser if needed)
app.get("/admin/orders", fetchuser, async (req, res) => {
  const orders = await Order.find({}).sort({ date: -1 });
  res.json(orders);
});

app.post("/admin/updateorder", fetchuser, async (req, res) => {
  const { orderId, status, financialsUpdate, note } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Use DetailedOrder model instead of basic Order
    let order = await DetailedOrder.findById(orderId).session(session);
    if (!order) {
      // Fallback to basic Order model for backwards compatibility
      order = await Order.findById(orderId).session(session);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
    }
    
    const prevStatus = order.status;
    console.log(`📋 Updating order ${order.orderNumber || order._id}: ${prevStatus} → ${status}`);

    if (financialsUpdate && typeof financialsUpdate === 'object') {
      order.financials = { ...(order.financials || {}), ...financialsUpdate };
    }

    order.status = status;

    const Metrics = require('./models/Metrics');
    const m = await getOrInitMetrics();

    // rollback if leaving delivered
    if (prevStatus?.toLowerCase() === 'delivered' && status?.toLowerCase() !== 'delivered' && order.revenueCounted) {
      m.totalRevenue = Number(m.totalRevenue || 0) - Number(order.realizedRevenue || 0);
      order.revenueCounted = false;
      m.updatedAt = new Date();
      await m.save({ session });
    }

    // handle delivered
    if (status?.toLowerCase() === 'delivered') {
      const newRevenue = computeOrderRevenue(order, { includeTax: order.financials?.includeTaxInRevenue });
      if (!order.revenueCounted) {
        m.totalRevenue = Number(m.totalRevenue || 0) + newRevenue;
        order.realizedRevenue = newRevenue;
        order.revenueCounted = true;
        m.updatedAt = new Date();
        await m.save({ session });
      } else if (Number(order.realizedRevenue || 0) !== newRevenue) {
        const delta = newRevenue - Number(order.realizedRevenue || 0);
        m.totalRevenue = Number(m.totalRevenue || 0) + delta;
        order.realizedRevenue = newRevenue;
        m.updatedAt = new Date();
        await m.save({ session });
      }
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    // broadcast after commit
    const fresh = await getOrInitMetrics();
    broadcastMetrics(fresh);

    // Send customer status update notification (async, non-blocking)
    if (prevStatus !== status) {
      setImmediate(async () => {
        try {
          console.log(`📧 Sending status update notification for order ${order.orderNumber || order._id}`);
          const notificationResult = await orderNotificationService.sendOrderStatusUpdate(
            order,
            prevStatus,
            status,
            note || ''
          );
          console.log(`📧 Status update notification result:`, {
            success: notificationResult.success,
            error: notificationResult.error
          });
        } catch (emailError) {
          console.error('❌ Status update email error (non-blocking):', emailError.message);
        }
      });
    }

    res.json({ 
      success: true,
      message: `Order ${order.orderNumber || order._id} status updated to ${status}`,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        prevStatus: prevStatus
      }
    });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    console.error('updateorder metrics error', e);
    res.status(500).json({ success: false, message: 'Update failed', error: e.message });
  }
});

// Email notification endpoints
app.get('/api/admin/email/status', requireAdminAuth, async (req, res) => {
  try {
    const status = orderNotificationService.getStatus();
    res.json({ 
      success: true, 
      emailService: status,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Email status check error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check email service status',
      details: error.message 
    });
  }
});

app.post('/api/admin/email/test', requireAdminAuth, async (req, res) => {
  try {
    console.log('🧪 Admin requested email test');
    const testResults = await orderNotificationService.testEmailConfiguration();
    
    res.json({ 
      success: true, 
      testResults,
      message: 'Email configuration test completed. Check your admin email for test message.',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Email configuration test failed',
      details: error.message 
    });
  }
});

// Manual email notification trigger for testing
app.post('/api/admin/email/send-test-notification', requireAdminAuth, async (req, res) => {
  try {
    const { orderId, type = 'admin' } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Order ID is required' 
      });
    }
    
    // Find the order
    let order = await DetailedOrder.findById(orderId);
    if (!order) {
      order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
      }
    }
    
    let result;
    if (type === 'admin') {
      result = await orderNotificationService.sendAdminNewOrderNotification(order);
    } else if (type === 'customer') {
      result = await orderNotificationService.sendCustomerOrderConfirmation(order);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid notification type. Use "admin" or "customer"' 
      });
    }
    
    res.json({ 
      success: true, 
      emailResult: result,
      message: `Test ${type} notification sent for order ${order.orderNumber || order._id}`,
      timestamp: new Date().toISOString() 
    });
    
  } catch (error) {
    console.error('Manual email notification error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send test notification',
      details: error.message 
    });
  }
});

// Push notification endpoints
// Web Push (VAPID) endpoints for iOS Safari and fallback
app.post('/api/admin/webpush/subscribe', requireAdminAuth, async (req, res) => {
  try {
    const adminId = req.admin?.id || req.admin?._id || 'unknown';
    const { subscription, deviceType, userAgent } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Invalid subscription' });
    }
    const result = await webPushService.subscribe(adminId, subscription, { deviceType, userAgent });
    res.json({ success: true, id: result.id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/webpush/status', requireAdminAuth, async (req, res) => {
  try {
    const subs = await webPushService.listSubscriptions(req.admin?.id || null);
    res.json({ success: true, total: subs.length, subscriptions: subs.map(s => ({ endpoint: s.endpoint, createdAt: s.createdAt })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/admin/webpush/test', requireAdminAuth, async (req, res) => {
  try {
    const result = await webPushService.sendTest(req.admin?.id || null);
    res.json({ success: result.success, total: result.total, successful: result.successful });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Quick config status (admin only)
app.get('/api/admin/webpush/config', requireAdminAuth, async (req, res) => {
  try {
    const status = webPushService.getStatus();
    // Expose the public VAPID key to authenticated admins so clients can subscribe
    res.json({ success: true, status, publicKey: process.env.WEBPUSH_VAPID_PUBLIC_KEY || null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
app.post('/api/admin/fcm/register-device', requireAdminAuth, async (req, res) => {
  try {
    const { fcmToken, deviceType, userAgent, timestamp } = req.body;
    
    if (!fcmToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'FCM token is required' 
      });
    }

    // Get admin ID from the authenticated request
    const adminId = req.admin?.id || req.admin?._id || 'unknown';
    
    console.log(`📱 Registering FCM device for admin ${adminId}`);
    
    const result = await pushNotificationService.registerDevice(adminId, {
      fcmToken,
      deviceType,
      userAgent,
      timestamp
    });
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        deviceId: result.deviceId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ FCM device registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device',
      details: error.message
    });
  }
});

app.get('/api/admin/fcm/devices', requireAdminAuth, async (req, res) => {
  try {
    const devices = await pushNotificationService.getRegisteredDevices();
    const status = pushNotificationService.getStatus();
    
    res.json({
      success: true,
      devices,
      status,
      totalDevices: devices.length
    });
  } catch (error) {
    console.error('❌ FCM devices fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch devices',
      details: error.message
    });
  }
});

app.post('/api/admin/fcm/test-notification', requireAdminAuth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    
    if (!fcmToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'FCM token is required for test' 
      });
    }
    
    console.log(`🧪 Sending test notification to device: ${fcmToken.substring(0, 20)}...`);
    
    const result = await pushNotificationService.sendTestNotification(fcmToken);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Test notification sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ FCM test notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification',
      details: error.message
    });
  }
});

app.post('/api/admin/fcm/cleanup', requireAdminAuth, async (req, res) => {
  try {
    const removedCount = pushNotificationService.cleanupExpiredTokens();
    
    res.json({
      success: true,
      message: `Cleaned up ${removedCount} expired device tokens`,
      removedCount
    });
  } catch (error) {
    console.error('❌ FCM cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup tokens',
      details: error.message
    });
  }
});

app.get('/api/admin/fcm/status', requireAdminAuth, async (req, res) => {
  try {
    const status = pushNotificationService.getStatus();
    
    res.json({
      success: true,
      pushNotificationService: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ FCM status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get push notification status',
      details: error.message
    });
  }
});

// Delivery Fee Management API
app.get("/admin/deliveryrates", fetchuser, async (req, res) => {
  const rates = await DeliveryFee.find({}).sort({ wilaya: 1, commune: 1 });
  res.json(rates);
});

app.post("/admin/deliveryrates", fetchuser, async (req, res) => {
  const { wilaya, commune, deliveryType, fee } = req.body;
  const existingRate = await DeliveryFee.findOne({ wilaya, commune, deliveryType });
  if (existingRate) {
    existingRate.fee = fee;
    await existingRate.save();
  } else {
    const rate = new DeliveryFee({ wilaya, commune, deliveryType, fee });
    await rate.save();
  }
  res.json({ success: true });
});

app.delete("/admin/deliveryrates/:id", fetchuser, async (req, res) => {
  await DeliveryFee.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Wilaya Management API
app.get("/admin/wilayas", fetchuser, async (req, res) => {
  try {
    const wilayas = await Wilaya.find({}).sort({ name: 1 });
    res.json(wilayas);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wilayas", error: error.message });
  }
});

app.post("/admin/wilayas", fetchuser, async (req, res) => {
  try {
    const { name, communes } = req.body;
    
    // Validation
    if (!name || !communes || communes.length === 0) {
      return res.status(400).json({ message: "Wilaya name and communes are required" });
    }
    
    // Check if wilaya already exists
    const existingWilaya = await Wilaya.findOne({ name });
    if (existingWilaya) {
      return res.status(400).json({ message: "Wilaya already exists" });
    }
    
    const wilaya = new Wilaya({ name, communes });
    await wilaya.save();
    res.json({ success: true, wilaya });
  } catch (error) {
    res.status(500).json({ message: "Error creating wilaya", error: error.message });
  }
});

app.put("/admin/wilayas/:id", fetchuser, async (req, res) => {
  try {
    const { name, communes } = req.body;
    
    // Validation
    if (!name || !communes || communes.length === 0) {
      return res.status(400).json({ message: "Wilaya name and communes are required" });
    }
    
    const wilaya = await Wilaya.findByIdAndUpdate(
      req.params.id,
      { name, communes },
      { new: true }
    );
    
    if (!wilaya) {
      return res.status(404).json({ message: "Wilaya not found" });
    }
    
    res.json({ success: true, wilaya });
  } catch (error) {
    res.status(500).json({ message: "Error updating wilaya", error: error.message });
  }
});

app.delete("/admin/wilayas/:id", fetchuser, async (req, res) => {
  try {
    const wilaya = await Wilaya.findByIdAndDelete(req.params.id);
    
    if (!wilaya) {
      return res.status(404).json({ message: "Wilaya not found" });
    }
    
    // Also delete related delivery rates
    await DeliveryFee.deleteMany({ wilaya: wilaya.name });
    
    res.json({ success: true, message: "Wilaya and related delivery rates deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting wilaya", error: error.message });
  }
});

// Public wilayas endpoint for checkout (no authentication required)
app.get("/wilayas", async (req, res) => {
  try {
    const wilayas = await Wilaya.find({}).sort({ name: 1 });
    res.json(wilayas);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wilayas", error: error.message });
  }
});

// Get delivery fee for checkout
app.post("/deliveryfee", async (req, res) => {
  const { wilaya, commune, deliveryType } = req.body;
  const rate = await DeliveryFee.findOne({ wilaya, commune, deliveryType });
  if (rate) {
    res.json({ success: true, fee: rate.fee });
  } else {
    res.json({ success: false, message: "Delivery not available for this location" });
  }
});

// Alias for admin frontend compatibility
app.post("/api/admin/shippingRates", async (req, res) => {
  const { wilaya, commune, deliveryType } = req.body;
  const rate = await DeliveryFee.findOne({ wilaya, commune, deliveryType });
  if (rate) {
    res.json({ success: true, fee: rate.fee });
  } else {
    res.json({ success: false, message: "Delivery not available for this location" });
  }
});

// Category Management API
// Public endpoint to get all categories (for frontend dropdown and navigation)
app.get("/categories", async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching categories", error: error.message });
  }
});

// Admin endpoint to get all categories
app.get("/admin/categories", fetchuser, async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error: error.message });
  }
});

// === Admin categories aliases under /api/admin using admin auth ===
// Upload category banner (api path)
app.post('/api/admin/categories/upload-banner', requireAdminAuth, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const validation = validateImage(req.file);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      imageUrl = req.file.path;
    } else {
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }
    res.json({ success: true, image_url: imageUrl, message: 'Banner uploaded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error uploading banner', error: error.message });
  }
});

app.get('/api/admin/categories', requireAdminAuth, async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching categories', error: error.message });
  }
});

app.post('/api/admin/categories', requireAdminAuth, async (req, res) => {
  try {
    const { name, subcategories = [], bannerImage = '' } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });

    const existing = await Category.findOne({ name });
    if (existing) return res.status(400).json({ success: false, message: 'Category already exists' });

    const cats = await Category.find({});
    const id = cats.length ? Math.max(...cats.map(c => c.id)) + 1 : 1;
    const processed = subcategories.map((sub, i) => ({ id: i + 1, name: typeof sub === 'string' ? sub : sub.name }));
    const category = new Category({ id, name, bannerImage, subcategories: processed });
    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating category', error: error.message });
  }
});

app.put('/api/admin/categories/:id', requireAdminAuth, async (req, res) => {
  try {
    const { name, subcategories = [], bannerImage } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });

    const processed = subcategories.map((sub, idx) => ({ id: sub.id || idx + 1, name: typeof sub === 'string' ? sub : sub.name }));
    const category = await Category.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      { name, subcategories: processed, bannerImage: bannerImage !== undefined ? bannerImage : undefined },
      { new: true }
    );
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating category', error: error.message });
  }
});

app.delete('/api/admin/categories/:id', requireAdminAuth, async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({ id: parseInt(req.params.id) });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting category', error: error.message });
  }
});

app.post('/api/admin/categories/:id/subcategories', requireAdminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Subcategory name is required' });

    const category = await Category.findOne({ id: parseInt(req.params.id) });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const exists = category.subcategories.find(s => s.name === name);
    if (exists) return res.status(400).json({ success: false, message: 'Subcategory already exists' });

    const newId = category.subcategories.length ? Math.max(...category.subcategories.map(s => s.id)) + 1 : 1;
    category.subcategories.push({ id: newId, name });
    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error adding subcategory', error: error.message });
  }
});

app.put('/api/admin/categories/:categoryId/subcategories/:subcategoryId', requireAdminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Subcategory name is required' });

    const category = await Category.findOne({ id: parseInt(req.params.categoryId) });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const idx = category.subcategories.findIndex(s => s.id === parseInt(req.params.subcategoryId));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Subcategory not found' });

    category.subcategories[idx].name = name;
    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating subcategory', error: error.message });
  }
});

app.delete('/api/admin/categories/:categoryId/subcategories/:subcategoryId', requireAdminAuth, async (req, res) => {
  try {
    const category = await Category.findOne({ id: parseInt(req.params.categoryId) });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const idx = category.subcategories.findIndex(s => s.id === parseInt(req.params.subcategoryId));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Subcategory not found' });

    category.subcategories.splice(idx, 1);
    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting subcategory', error: error.message });
  }
});

// Upload category banner (legacy /admin path)
app.post('/admin/categories/upload-banner', fetchuser, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const validation = validateImage(req.file);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      imageUrl = req.file.path;
    } else {
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }
    res.json({ success: true, image_url: imageUrl, message: 'Banner uploaded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error uploading banner', error: error.message });
  }
});

// Add new category
app.post("/admin/categories", fetchuser, async (req, res) => {
  try {
    const { name, subcategories = [], bannerImage = '' } = req.body;
    
    // Validation
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }
    
    // Check if category already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists" });
    }
    
    // Get next category ID
    const categories = await Category.find({});
    const id = categories.length ? Math.max(...categories.map(c => c.id)) + 1 : 1;
    
    // Process subcategories with auto-generated IDs
    const processedSubcategories = subcategories.map((sub, index) => ({
      id: index + 1,
      name: typeof sub === 'string' ? sub : sub.name
    }));
    
    const category = new Category({ 
      id, 
      name, 
      bannerImage,
      subcategories: processedSubcategories 
    });
    
    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ message: "Error creating category", error: error.message });
  }
});

// Update category
app.put("/admin/categories/:id", fetchuser, async (req, res) => {
  try {
    const { name, subcategories = [], bannerImage } = req.body;
    
    // Validation
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }
    
    // Process subcategories with proper IDs
    const processedSubcategories = subcategories.map((sub, index) => ({
      id: sub.id || index + 1,
      name: typeof sub === 'string' ? sub : sub.name
    }));
    
    const category = await Category.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      { name, subcategories: processedSubcategories, bannerImage: bannerImage !== undefined ? bannerImage : undefined },
      { new: true }
    );
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ message: "Error updating category", error: error.message });
  }
});

// Delete category
app.delete("/admin/categories/:id", fetchuser, async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({ id: parseInt(req.params.id) });
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting category", error: error.message });
  }
});

// Add subcategory to existing category
app.post("/admin/categories/:id/subcategories", fetchuser, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Subcategory name is required" });
    }
    
    const category = await Category.findOne({ id: parseInt(req.params.id) });
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    // Check if subcategory already exists
    const existingSubcategory = category.subcategories.find(sub => sub.name === name);
    if (existingSubcategory) {
      return res.status(400).json({ message: "Subcategory already exists" });
    }
    
    // Generate new subcategory ID
    const newSubcategoryId = category.subcategories.length ? 
      Math.max(...category.subcategories.map(sub => sub.id)) + 1 : 1;
    
    category.subcategories.push({ id: newSubcategoryId, name });
    await category.save();
    
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ message: "Error adding subcategory", error: error.message });
  }
});

// Update subcategory
app.put("/admin/categories/:categoryId/subcategories/:subcategoryId", fetchuser, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Subcategory name is required" });
    }
    
    const category = await Category.findOne({ id: parseInt(req.params.categoryId) });
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    const subcategoryIndex = category.subcategories.findIndex(
      sub => sub.id === parseInt(req.params.subcategoryId)
    );
    
    if (subcategoryIndex === -1) {
      return res.status(404).json({ message: "Subcategory not found" });
    }
    
    category.subcategories[subcategoryIndex].name = name;
    await category.save();
    
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ message: "Error updating subcategory", error: error.message });
  }
});

// Delete subcategory
app.delete("/admin/categories/:categoryId/subcategories/:subcategoryId", fetchuser, async (req, res) => {
  try {
    const category = await Category.findOne({ id: parseInt(req.params.categoryId) });
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    const subcategoryIndex = category.subcategories.findIndex(
      sub => sub.id === parseInt(req.params.subcategoryId)
    );
    
    if (subcategoryIndex === -1) {
      return res.status(404).json({ message: "Subcategory not found" });
    }
    
    category.subcategories.splice(subcategoryIndex, 1);
    await category.save();
    
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ message: "Error deleting subcategory", error: error.message });
  }
});

// Shop Images Management API
const fs = require('fs');

// Image validation function
const validateImage = (file) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  if (!allowedTypes.includes(file.mimetype)) {
    return { valid: false, message: 'Invalid file type. Only JPEG, PNG, and WEBP are allowed.' };
  }
  
  if (file.size > maxSize) {
    return { valid: false, message: 'File size too large. Maximum size is 5MB.' };
  }
  
  return { valid: true };
};

// Upload shop image
app.post("/admin/shop-images/upload", requireAdminAuth, upload.single('shopImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const { title, description, imageType, category } = req.body;
    
    if (!title || !imageType) {
      return res.status(400).json({ success: false, message: "Title and image type are required" });
    }
    
    // Get the image URL
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      // Cloudinary URL
      imageUrl = req.file.path;
    } else {
      // Local development
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }
    
    // Get next ID
    const images = await ShopImage.find({});
    const id = images.length ? Math.max(...images.map(img => img.id)) + 1 : 1;
    
    // Get next order for this image type
    const typeImages = await ShopImage.find({ imageType });
    const order = typeImages.length ? Math.max(...typeImages.map(img => img.order)) + 1 : 0;
    
    const shopImage = new ShopImage({
      id,
      title,
      description: description || '',
      image: imageUrl,
      imageType,
      category: category || null,
      order,
      visible: true
    });
    
    await shopImage.save();
    
    res.json({ 
      success: true, 
      image: shopImage,
      message: "Image uploaded successfully" 
    });
  } catch (error) {
    console.error("Upload Shop Image Error:", error);
    res.status(500).json({ success: false, message: "Error uploading image", error: error.message });
  }
});

// Get all shop images
app.get("/admin/shop-images", requireAdminAuth, async (req, res) => {
  try {
    const images = await ShopImage.find({}).sort({ imageType: 1, order: 1 });
    res.json({ success: true, images });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching images", error: error.message });
  }
});

// Get shop images by type (public endpoint for frontend)
app.get("/shop-images/:type?", async (req, res) => {
  try {
    // Add CORS headers for image access
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    
    const { type } = req.params;
    const query = type ? { imageType: type, visible: true } : { visible: true };
    const images = await ShopImage.find(query).sort({ order: 1 });
    res.json({ success: true, images });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching images", error: error.message });
  }
});

// Update shop image
app.put("/admin/shop-images/:id", requireAdminAuth, async (req, res) => {
  try {
    const { title, description, visible, order, category } = req.body;
    
    const image = await ShopImage.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      { 
        title: title || undefined,
        description: description !== undefined ? description : undefined,
        visible: visible !== undefined ? visible : undefined,
        order: order !== undefined ? order : undefined,
        category: category !== undefined ? category : undefined
      },
      { new: true }
    );
    
    if (!image) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    
    res.json({ success: true, image, message: "Image updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating image", error: error.message });
  }
});

// Replace image file
app.put("/admin/shop-images/:id/replace", requireAdminAuth, upload.single('shopImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const shopImage = await ShopImage.findOne({ id: parseInt(req.params.id) });
    
    if (!shopImage) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    
    // Get the new image URL
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      // Cloudinary URL
      imageUrl = req.file.path;
    } else {
      // Local development
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }
    
    // Update with new image URL
    shopImage.image = imageUrl;
    await shopImage.save();
    
    res.json({ 
      success: true, 
      image: shopImage,
      message: "Image replaced successfully" 
    });
  } catch (error) {
    console.error("Replace Shop Image Error:", error);
    res.status(500).json({ success: false, message: "Error replacing image", error: error.message });
  }
});

// Reorder images
app.post("/admin/shop-images/reorder", requireAdminAuth, async (req, res) => {
  try {
    const { imageIds } = req.body; // Array of image IDs in new order
    
    if (!Array.isArray(imageIds)) {
      return res.status(400).json({ success: false, message: "Image IDs must be an array" });
    }
    
    // Update order for each image
    for (let i = 0; i < imageIds.length; i++) {
      await ShopImage.findOneAndUpdate(
        { id: imageIds[i] },
        { order: i }
      );
    }
    
    res.json({ success: true, message: "Images reordered successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error reordering images", error: error.message });
  }
});

// Delete shop image
app.delete("/admin/shop-images/:id", requireAdminAuth, async (req, res) => {
  try {
    const image = await ShopImage.findOneAndDelete({ id: parseInt(req.params.id) });
    
    if (!image) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    
    // Note: In production, images are stored in Cloudinary which handles deletion automatically
    // when the database record is removed. No manual file deletion needed.
    console.log(`Shop image deleted: ${image.title} (${image.image})`);
    
    res.json({ success: true, message: "Image deleted successfully" });
  } catch (error) {
    console.error("Delete Shop Image Error:", error);
    res.status(500).json({ success: false, message: "Error deleting image", error: error.message });
  }
});

// Toggle image visibility
app.post("/admin/shop-images/:id/toggle-visibility", requireAdminAuth, async (req, res) => {
  try {
    const image = await ShopImage.findOne({ id: parseInt(req.params.id) });
    
    if (!image) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    
    image.visible = !image.visible;
    await image.save();
    
    res.json({ 
      success: true, 
      image,
      message: `Image ${image.visible ? 'shown' : 'hidden'} successfully` 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error toggling visibility", error: error.message });
  }
});

// Collections Management API

// Get all collections (public endpoint for frontend)
app.get("/collections", async (req, res) => {
  try {
    // Add CORS headers for cross-origin access
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    
    const collections = await Collection.find({ isVisible: true })
      .populate('products')
      .sort({ order: 1 });
    res.json({ success: true, collections });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching collections", error: error.message });
  }
});

// Get all collections (admin endpoint)
app.get("/admin/collections", requireAdminAuth, async (req, res) => {
  try {
    const collections = await Collection.find({})
      .populate('products')
      .sort({ order: 1 });
    res.json({ success: true, collections });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching collections", error: error.message });
  }
});

// Create new collection
app.post("/admin/collections", requireAdminAuth, async (req, res) => {
  try {
    const { name, bannerImage, products = [], isVisible = true } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: "Collection name is required" });
    }
    
    // Check if collection already exists
    const existingCollection = await Collection.findOne({ name });
    if (existingCollection) {
      return res.status(400).json({ success: false, message: "Collection already exists" });
    }
    
    // Get next order
    const collections = await Collection.find({});
    const order = collections.length ? Math.max(...collections.map(c => c.order || 0)) + 1 : 0;
    
    const collection = new Collection({
      name,
      bannerImage,
      products,
      isVisible,
      order
    });
    
    await collection.save();
    await collection.populate('products');
    
    res.json({ success: true, collection, message: "Collection created successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating collection", error: error.message });
  }
});

// Update collection
app.put("/admin/collections/:id", requireAdminAuth, async (req, res) => {
  try {
    const { name, bannerImage, products, isVisible, order } = req.body;
    
    const collection = await Collection.findByIdAndUpdate(
      req.params.id,
      {
        name: name || undefined,
        bannerImage: bannerImage !== undefined ? bannerImage : undefined,
        products: products || undefined,
        isVisible: isVisible !== undefined ? isVisible : undefined,
        order: order !== undefined ? order : undefined
      },
      { new: true }
    ).populate('products');
    
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    
    res.json({ success: true, collection, message: "Collection updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating collection", error: error.message });
  }
});

// Delete collection
app.delete("/admin/collections/:id", requireAdminAuth, async (req, res) => {
  try {
    const collection = await Collection.findByIdAndDelete(req.params.id);
    
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    
    // Note: In production, banner images are stored in Cloudinary which handles deletion automatically
    // when the database record is removed. No manual file deletion needed.
    console.log(`Collection deleted: ${collection.name} ${collection.bannerImage ? `(banner: ${collection.bannerImage})` : '(no banner)'}`);
    
    res.json({ success: true, message: "Collection deleted successfully" });
  } catch (error) {
    console.error("Delete Collection Error:", error);
    res.status(500).json({ success: false, message: "Error deleting collection", error: error.message });
  }
});

// Add products to collection
app.post("/admin/collections/:id/products", requireAdminAuth, async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "Product IDs must be an array" });
    }
    
    const collection = await Collection.findById(req.params.id);
    
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    
    // Add new products (avoid duplicates)
    productIds.forEach(productId => {
      if (!collection.products.includes(productId)) {
        collection.products.push(productId);
      }
    });
    
    await collection.save();
    await collection.populate('products');
    
    res.json({ success: true, collection, message: "Products added to collection" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error adding products to collection", error: error.message });
  }
});

// Remove products from collection
app.delete("/admin/collections/:id/products", requireAdminAuth, async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "Product IDs must be an array" });
    }
    
    const collection = await Collection.findById(req.params.id);
    
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    
    // Remove products
    collection.products = collection.products.filter(
      productId => !productIds.includes(productId.toString())
    );
    
    await collection.save();
    await collection.populate('products');
    
    res.json({ success: true, collection, message: "Products removed from collection" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error removing products from collection", error: error.message });
  }
});

// Reorder collections
app.post("/admin/collections/reorder", requireAdminAuth, async (req, res) => {
  try {
    const { collectionIds } = req.body;
    
    if (!Array.isArray(collectionIds)) {
      return res.status(400).json({ success: false, message: "Collection IDs must be an array" });
    }
    
    // Update order for each collection
    for (let i = 0; i < collectionIds.length; i++) {
      await Collection.findByIdAndUpdate(
        collectionIds[i],
        { order: i }
      );
    }
    
    res.json({ success: true, message: "Collections reordered successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error reordering collections", error: error.message });
  }
});

// Toggle collection visibility
app.post("/admin/collections/:id/toggle-visibility", requireAdminAuth, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);
    
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    
    collection.isVisible = !collection.isVisible;
    await collection.save();
    
    res.json({ 
      success: true, 
      collection,
      message: `Collection ${collection.isVisible ? 'shown' : 'hidden'} successfully` 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error toggling visibility", error: error.message });
  }
});

// Upload collection banner image
app.post("/admin/collections/upload-banner", requireAdminAuth, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    // Get the image URL based on environment
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      // Cloudinary URL
      imageUrl = req.file.path;
    } else {
      // Local development
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }
    
    res.json({ 
      success: true, 
      image_url: imageUrl,
      message: "Banner uploaded successfully" 
    });
  } catch (error) {
    console.error("Upload Banner Error:", error);
    res.status(500).json({ success: false, message: "Error uploading banner", error: error.message });
  }
});

// === Compatibility duplicates under /api/admin to match admin panel expectations ===
// Get all collections
app.get("/api/admin/collections", requireAdminAuth, async (req, res) => {
  try {
    const collections = await Collection.find({})
      .populate('products')
      .sort({ order: 1 });
    res.json({ success: true, collections });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching collections", error: error.message });
  }
});

// Create new collection
app.post("/api/admin/collections", requireAdminAuth, async (req, res) => {
  try {
    const { name, bannerImage, products = [], isVisible = true } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Collection name is required" });
    }

    const existingCollection = await Collection.findOne({ name });
    if (existingCollection) {
      return res.status(400).json({ success: false, message: "Collection already exists" });
    }

    const collections = await Collection.find({});
    const order = collections.length ? Math.max(...collections.map(c => c.order || 0)) + 1 : 0;

    const collection = new Collection({ name, bannerImage, products, isVisible, order });
    await collection.save();
    await collection.populate('products');

    res.json({ success: true, collection, message: "Collection created successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating collection", error: error.message });
  }
});

// Update collection
app.put("/api/admin/collections/:id", requireAdminAuth, async (req, res) => {
  try {
    const { name, bannerImage, products, isVisible, order } = req.body;
    const collection = await Collection.findByIdAndUpdate(
      req.params.id,
      {
        name: name || undefined,
        bannerImage: bannerImage !== undefined ? bannerImage : undefined,
        products: products || undefined,
        isVisible: isVisible !== undefined ? isVisible : undefined,
        order: order !== undefined ? order : undefined
      },
      { new: true }
    ).populate('products');

    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }

    res.json({ success: true, collection, message: "Collection updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating collection", error: error.message });
  }
});

// Delete collection
app.delete("/api/admin/collections/:id", requireAdminAuth, async (req, res) => {
  try {
    const collection = await Collection.findByIdAndDelete(req.params.id);
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    res.json({ success: true, message: "Collection deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting collection", error: error.message });
  }
});

// Toggle visibility
app.post("/api/admin/collections/:id/toggle-visibility", requireAdminAuth, async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.id);
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }
    collection.isVisible = !collection.isVisible;
    await collection.save();
    res.json({ success: true, collection, message: `Collection ${collection.isVisible ? 'shown' : 'hidden'} successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error toggling visibility", error: error.message });
  }
});

// Upload banner (api path)
app.post("/api/admin/collections/upload-banner", requireAdminAuth, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      imageUrl = req.file.path;
    } else {
      imageUrl = `/images/${req.file.filename || Date.now()}`;
    }
    res.json({ success: true, image_url: imageUrl, message: "Banner uploaded successfully" });
  } catch (error) {
    console.error("Upload Banner Error:", error);
    res.status(500).json({ success: false, message: "Error uploading banner", error: error.message });
  }
});

// Email Notifications Management API
// Get notification settings
app.get("/admin/email/notifications", requireAdminAuth, async (req, res) => {
  try {
    // Mock notification settings - in production, this would come from database
    const notificationSettings = {
      lowStockAlerts: true,
      orderConfirmations: true,
      welcomeEmails: true,
      marketingEmails: false,
      adminAlerts: true,
      emailProvider: process.env.EMAIL_PROVIDER || 'not_configured',
      lastTest: null
    };
    
    res.json({ success: true, settings: notificationSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching notification settings", error: error.message });
  }
});

// Update notification settings
app.post("/admin/email/notifications/settings", requireAdminAuth, async (req, res) => {
  try {
    const { lowStockAlerts, orderConfirmations, welcomeEmails, marketingEmails, adminAlerts } = req.body;
    
    // In production, save these to database
    const updatedSettings = {
      lowStockAlerts: lowStockAlerts !== undefined ? lowStockAlerts : true,
      orderConfirmations: orderConfirmations !== undefined ? orderConfirmations : true,
      welcomeEmails: welcomeEmails !== undefined ? welcomeEmails : true,
      marketingEmails: marketingEmails !== undefined ? marketingEmails : false,
      adminAlerts: adminAlerts !== undefined ? adminAlerts : true,
      emailProvider: process.env.EMAIL_PROVIDER || 'not_configured',
      lastUpdated: new Date().toISOString()
    };
    
    console.log('📧 Email notification settings updated by admin:', req.user.id);
    
    res.json({ success: true, settings: updatedSettings, message: "Notification settings updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating notification settings", error: error.message });
  }
});

// Send test email
app.post("/admin/email/notifications/test", requireAdminAuth, async (req, res) => {
  try {
    const { to, subject = 'Test Email from Damio Kids Admin' } = req.body;
    
    if (!to) {
      return res.status(400).json({ success: false, message: "Recipient email is required" });
    }
    
    // Mock email sending - in production, use actual email service
    const testResult = {
      success: true,
      messageId: 'test-' + Date.now(),
      to: to,
      subject: subject,
      sentAt: new Date().toISOString(),
      provider: process.env.EMAIL_PROVIDER || 'mock'
    };
    
    console.log('📧 Test email sent:', testResult);
    
    res.json({ 
      success: true, 
      result: testResult,
      message: "Test email sent successfully" 
    });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ success: false, message: "Error sending test email", error: error.message });
  }
});

// Get email logs (mock implementation)
app.get("/admin/email/notifications/logs", requireAdminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    // Mock email logs - in production, fetch from database
    const mockLogs = [
      {
        id: 1,
        type: 'order_confirmation',
        to: 'customer@example.com',
        subject: 'Order Confirmation #12345',
        status: 'sent',
        sentAt: new Date().toISOString(),
        messageId: 'msg-12345'
      },
      {
        id: 2,
        type: 'low_stock_alert',
        to: 'admin@damiokids.com',
        subject: 'Low Stock Alert - Product ID 123',
        status: 'sent',
        sentAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        messageId: 'msg-12346'
      },
      {
        id: 3,
        type: 'welcome_email',
        to: 'newuser@example.com',
        subject: 'Welcome to Damio Kids!',
        status: 'failed',
        sentAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        error: 'Invalid email address'
      }
    ];
    
    res.json({
      success: true,
      logs: mockLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: 1,
        totalLogs: mockLogs.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching email logs", error: error.message });
  }
});


// Global error handler middleware (must be after all routes)
app.use((error, req, res, next) => {
  console.error('🚨 Global error handler caught:', error);
  
  // Log request details for debugging
  console.error('Request details:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    headers: req.headers
  });
  
  // Always return JSON error responses
  const response = {
    success: false,
    message: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  };
  
  // Add more details in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = error.stack;
    response.details = {
      name: error.name,
      code: error.code
    };
  }
  
  // Determine status code
  let statusCode = 500;
  if (error.statusCode) {
    statusCode = error.statusCode;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    statusCode = 401;
  } else if (error.code === 11000) { // MongoDB duplicate key
    statusCode = 409;
    response.message = 'Duplicate entry found';
  }
  
  res.status(statusCode).json(response);
});

// Aliases with /api/admin prefix for admin endpoints defined under /admin
// Fixes 404s from admin panel calling /api/admin/... paths
app.post("/api/admin/shop-images/upload", requireAdminAuth, upload.single('shopImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { title, description, imageType, category } = req.body;

    if (!title || !imageType) {
      return res.status(400).json({ success: false, message: "Title and image type are required" });
    }

    // Get the image URL
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      imageUrl = req.file.path; // Cloudinary URL
    } else {
      imageUrl = `/images/${req.file.filename || Date.now()}`; // Local fallback
    }

    // Get next ID
    const images = await ShopImage.find({});
    const id = images.length ? Math.max(...images.map(img => img.id)) + 1 : 1;

    // Get next order for this image type
    const typeImages = await ShopImage.find({ imageType });
    const order = typeImages.length ? Math.max(...typeImages.map(img => img.order)) + 1 : 0;

    const shopImage = new ShopImage({
      id,
      title,
      description: description || '',
      image: imageUrl,
      imageType,
      category: category || null,
      order,
      visible: true
    });

    await shopImage.save();

    res.json({
      success: true,
      image: shopImage,
      message: "Image uploaded successfully"
    });
  } catch (error) {
    console.error("Upload Shop Image Error (alias):", error);
    res.status(500).json({ success: false, message: "Error uploading image", error: error.message });
  }
});

// Alias for uploading collection banner under /api/admin
app.post("/api/admin/collections/upload-banner", requireAdminAuth, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    // Get the image URL based on environment
    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      imageUrl = req.file.path; // Cloudinary URL
    } else {
      imageUrl = `/images/${req.file.filename || Date.now()}`; // Local fallback
    }

    res.json({
      success: true,
      image_url: imageUrl,
      message: "Banner uploaded successfully"
    });
  } catch (error) {
    console.error("Upload Banner Error (alias):", error);
    res.status(500).json({ success: false, message: "Error uploading banner", error: error.message });
  }
});

// Alias for reordering shop images under /api/admin
app.post("/api/admin/shop-images/reorder", requireAdminAuth, async (req, res) => {
  try {
    const { imageIds } = req.body; // Array of image IDs in the new order

    if (!Array.isArray(imageIds)) {
      return res.status(400).json({ success: false, message: "Image IDs must be an array" });
    }

    for (let i = 0; i < imageIds.length; i++) {
      await ShopImage.findOneAndUpdate(
        { id: imageIds[i] },
        { order: i }
      );
    }

    res.json({ success: true, message: "Images reordered successfully" });
  } catch (error) {
    console.error("Reorder Shop Images Error (alias):", error);
    res.status(500).json({ success: false, message: "Error reordering images", error: error.message });
  }
});

// Email aliases for admin UI compatibility
app.get('/api/admin/email/notifications', requireAdminAuth, async (req, res) => {
  try {
    const notificationSettings = {
      lowStockAlerts: true,
      orderConfirmations: true,
      welcomeEmails: true,
      marketingEmails: false,
      adminAlerts: true,
      emailProvider: process.env.EMAIL_PROVIDER || 'not_configured',
      lastTest: null
    };
    res.json({ success: true, data: notificationSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching notification settings', error: error.message });
  }
});

app.get('/api/admin/email/stats', requireAdminAuth, (req, res) => {
  // Minimal stats implementation; extend with real data when available
  res.json({
    success: true,
    data: {
      sent: 0,
      pending: 0,
      failed: 0,
      today: 0,
      total: 0
    }
  });
});

app.post('/api/admin/email/send-test', requireAdminAuth, async (req, res) => {
  try {
    const { to, subject = 'Test Email from Damio Kids Admin', message = '' } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, message: 'Recipient email is required' });
    }
    const testResult = {
      success: true,
      messageId: 'test-' + Date.now(),
      to,
      subject,
      message,
      sentAt: new Date().toISOString(),
      provider: process.env.EMAIL_PROVIDER || 'mock'
    };
    res.json({ success: true, result: testResult, message: 'Test email sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error sending test email', error: error.message });
  }
});

app.post('/api/admin/email/resend/:id', requireAdminAuth, (req, res) => {
  // Stubbed resend endpoint for UI flow
  res.json({ success: true, message: 'Email resent', id: req.params.id });
});

// Analytics aliases expected by the admin UI
app.get('/api/admin/analytics/sales-trends', requireAdminAuth, async (req, res) => {
  try {
    const Order = mongoose.model('Order');
    const startDate = new Date(req.query.startDate || Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date(req.query.endDate || Date.now());

    // Group by day and include delivered revenue. For orders that predate the
    // realizedRevenue field, fall back to total when status is delivered.
    const series = await Order.aggregate([
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      { $project: {
          dateKey: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          isDelivered: { $eq: [ { $toLower: '$status' }, 'delivered' ] },
          realized: { $ifNull: ['$realizedRevenue', 0] },
          total: { $ifNull: ['$total', 0] }
        }
      },
      { $group: {
          _id: '$dateKey',
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [ '$isDelivered', { $cond: [ { $gt: ['$realized', 0] }, '$realized', '$total' ] }, 0 ] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data: { trends: series.map(d => ({ date: d._id, orders: d.orders, revenue: d.revenue })) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching sales trends', error: error.message });
  }
});

app.get('/api/admin/analytics/customers', requireAdminAuth, async (req, res) => {
  try {
    const Users = mongoose.model('Users');
    const total = await Users.countDocuments({});
    res.json({ success: true, data: { totalCustomers: total, newCustomers: 0, returningCustomers: 0, averageOrderValue: 0, retentionRate: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching customer insights', error: error.message });
  }
});

app.get('/api/admin/analytics/inventory', requireAdminAuth, async (req, res) => {
  try {
    const Product = mongoose.model('Product');
    const totalProducts = await Product.countDocuments({});
    res.json({ success: true, data: { totalProducts, lowStockCount: 0, outOfStockCount: 0, totalStockValue: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching inventory insights', error: error.message });
  }
});

// Handle 404 for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: {
      health: 'GET /health',
      auth: 'POST /login, POST /signup',
      admin: 'POST /api/admin/auth/login',
      products: 'GET /allproducts',
      public: 'GET /categories, GET /wilayas'
    }
  });
});

// Metrics rebuild (admin-only)
app.post('/api/admin/metrics/rebuild', requireAdminAuth, async (req, res) => {
  try {
    const Order = mongoose.model('Order');
    const Metrics = require('./models/Metrics');
    const agg = await Order.aggregate([
      { $match: { revenueCounted: true } },
      { $group: { _id: null, totalRevenue: { $sum: { $ifNull: ['$realizedRevenue', 0] } } } }
    ]);
    const totalRevenue = agg?.[0]?.totalRevenue || 0;
    const totalOrders = await Order.countDocuments({});
    const m = await Metrics.findByIdAndUpdate('global', { $set: { totalRevenue, totalOrders, updatedAt: new Date() } }, { upsert: true, new: true });
    broadcastMetrics(m);
    res.json({ success: true, data: { totalRevenue: m.totalRevenue, totalOrders: m.totalOrders, updatedAt: m.updatedAt } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Rebuild failed', error: e.message });
  }
});

// Refund endpoint
app.post('/api/admin/orders/refund', requireAdminAuth, async (req, res) => {
  const { orderId, amount } = req.body;
  if (!orderId || isNaN(Number(amount))) return res.status(400).json({ success: false, message: 'orderId and numeric amount required' });
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const Order = mongoose.model('Order');
    const Metrics = require('./models/Metrics');
    const order = await Order.findById(orderId).session(session);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.financials = order.financials || {};
    order.financials.refundedAmount = Number(order.financials.refundedAmount || 0) + Number(amount);

    let mChanged = false;
    let m = await Metrics.findById('global').session(session);
    if (!m) m = await Metrics.create([{ _id: 'global', totalRevenue: 0, totalOrders: 0 }], { session }).then(([d])=>d);

    if (order.status?.toLowerCase() === 'delivered' && order.revenueCounted) {
      const newRevenue = computeOrderRevenue(order, { includeTax: order.financials?.includeTaxInRevenue });
      const delta = newRevenue - Number(order.realizedRevenue || 0);
      m.totalRevenue = Number(m.totalRevenue || 0) + delta;
      order.realizedRevenue = newRevenue;
      m.updatedAt = new Date();
      await m.save({ session });
      mChanged = true;
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    if (mChanged) {
      const fresh = await getOrInitMetrics();
      broadcastMetrics(fresh);
    }

    res.json({ success: true });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: 'Refund failed', error: e.message });
  }
});

// For Vercel serverless functions, export the app instead of listening
module.exports = app;

// For local development, start the server
if (require.main === module) {
  app.listen(port, () => console.log("Server Running on port " + port));
}
