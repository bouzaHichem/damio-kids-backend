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
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const port = process.env.PORT || 4000;

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

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'http://localhost:3000', // Local frontend development
      'http://localhost:3001', // Local admin development
      process.env.FRONTEND_URL, // Production frontend URL
      process.env.ADMIN_URL,    // Production admin URL
    ].filter(Boolean); // Remove undefined values
    
    // Add specific Vercel URLs if environment variables not set (fallback)
    if (!process.env.FRONTEND_URL || !process.env.ADMIN_URL) {
      allowedOrigins.push(
        'https://damio-kids-final-project-hnvnrxzrl-hichems-projects-d5b6dfcd.vercel.app',
        'https://damio-kids-final-project-bhz7a3q9u-hichems-projects-d5b6dfcd.vercel.app',
        'https://damio-kids-final-project-yor62j7zs-hichems-projects-d5b6dfcd.vercel.app',
        'https://damio-kids-final-project-by98m3xod-hichems-projects-d5b6dfcd.vercel.app'
      );
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS policy'));
    }
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
  optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.error('MONGODB_URI environment variable is not defined');
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MONGODB_URI is required in production');
      }
      console.warn('Using default local MongoDB connection');
    }
    
    await mongoose.connect(mongoURI || "mongodb://localhost:27017/damio-kids", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
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

const Product = mongoose.model("Product", {
  id: Number,
  name: String,
  description: String,
  image: String,
  images: [String], // Multiple images support
  category: String,
  new_price: Number,
  old_price: Number,
  // Product variants
  sizes: [String], // e.g., ["XS", "S", "M", "L", "XL"]
  colors: [String], // e.g., ["Red", "Blue", "Green"]
  ageRange: {
    min: Number, // minimum age in months
    max: Number  // maximum age in months
  },
  // Additional professional fields
  brand: String,
  material: String,
  care_instructions: String,
  weight: Number, // in grams
  dimensions: {
    length: Number, // in cm
    width: Number,  // in cm
    height: Number  // in cm
  },
  stock_quantity: { type: Number, default: 0 },
  sku: String, // Stock Keeping Unit
  tags: [String], // for search and filtering
  // SEO fields
  meta_title: String,
  meta_description: String,
  // Product status
  status: { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
  featured: { type: Boolean, default: false },
  on_sale: { type: Boolean, default: false },
  // Collection flags
  newCollection: { type: Boolean, default: false },
  popular: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  avilable: { type: Boolean, default: true }
});

const Order = mongoose.model("Order", {
  userId: String,
  items: Array,
  total: Number,
  deliveryFee: { type: Number, default: 0 },
  address: String,
  wilaya: String,
  commune: String,
  deliveryType: { type: String, enum: ['home', 'pickup'], default: 'home' },
  status: { type: String, default: "Pending" },
  date: { type: Date, default: Date.now }
});

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


// Import admin routes
const adminAuthRoutes = require('./routes/adminAuth');
const adminSettingsRoutes = require('./routes/admin/settings');
const { requireAdminAuth, requirePermission } = require('./middleware/adminAuth');

// Routes
app.get("/", (req, res) => res.send("Damio Kids API - Server is running!"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Damio Kids API is running", timestamp: new Date().toISOString() });
});

// Admin authentication routes
app.use('/api/admin/auth', adminAuthRoutes);

// Admin settings routes
app.use('/api/admin/settings', adminSettingsRoutes);

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
    
    // Enhance products with resolved category information
    const enhancedProducts = products.map(product => {
      const productObj = product.toObject();
      
      // If category is an ObjectId, try to resolve it to category name
      if (productObj.category && productObj.category.match(/^[0-9a-fA-F]{24}$/)) {
        const matchingCategory = categories.find(cat => cat._id.toString() === productObj.category);
        if (matchingCategory) {
          productObj.categoryName = matchingCategory.name;
          productObj.categoryId = matchingCategory._id;
        }
      } else {
        // Category is already a name, keep it as is
        productObj.categoryName = productObj.category;
        const matchingCategory = categories.find(cat => cat.name === productObj.category);
        if (matchingCategory) {
          productObj.categoryId = matchingCategory._id;
        }
      }
      
      return productObj;
    });
    
    res.send(enhancedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Advanced Products Search and Filter API
app.get("/products/search", async (req, res) => {
  try {
    const {
      q: searchQuery,
      category,
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

    // Category filter
    if (category && category !== 'all') {
      query.category = new RegExp(category, 'i');
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

// ✅ Place Order (available to all users, logged in or guest)
app.post("/placeorder", async (req, res) => {
  const { items, total, address, userId } = req.body;
  const order = new Order({
    userId: userId || "guest",
    items,
    total,
    address
  });
  await order.save();
  res.json({ success: true, order });
});

// Admin Orders (optional: protect with fetchuser if needed)
app.get("/admin/orders", fetchuser, async (req, res) => {
  const orders = await Order.find({}).sort({ date: -1 });
  res.json(orders);
});

app.post("/admin/updateorder", fetchuser, async (req, res) => {
  const { orderId, status } = req.body;
  await Order.findByIdAndUpdate(orderId, { status });
  res.json({ success: true });
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

// Add new category
app.post("/admin/categories", fetchuser, async (req, res) => {
  try {
    const { name, subcategories = [] } = req.body;
    
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
    const { name, subcategories = [] } = req.body;
    
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
      { name, subcategories: processedSubcategories },
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
app.post("/admin/shop-images/upload", fetchuser, upload.single('shopImage'), async (req, res) => {
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
app.get("/admin/shop-images", fetchuser, async (req, res) => {
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
    const { type } = req.params;
    const query = type ? { imageType: type, visible: true } : { visible: true };
    const images = await ShopImage.find(query).sort({ order: 1 });
    res.json({ success: true, images });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching images", error: error.message });
  }
});

// Update shop image
app.put("/admin/shop-images/:id", fetchuser, async (req, res) => {
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
app.put("/admin/shop-images/:id/replace", fetchuser, upload.single('shopImage'), async (req, res) => {
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
app.post("/admin/shop-images/reorder", fetchuser, async (req, res) => {
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
app.delete("/admin/shop-images/:id", fetchuser, async (req, res) => {
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
app.post("/admin/shop-images/:id/toggle-visibility", fetchuser, async (req, res) => {
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
    const collections = await Collection.find({ isVisible: true })
      .populate('products')
      .sort({ order: 1 });
    res.json({ success: true, collections });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching collections", error: error.message });
  }
});

// Get all collections (admin endpoint)
app.get("/admin/collections", fetchuser, async (req, res) => {
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
app.post("/admin/collections", fetchuser, async (req, res) => {
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
app.put("/admin/collections/:id", fetchuser, async (req, res) => {
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
app.delete("/admin/collections/:id", fetchuser, async (req, res) => {
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
app.post("/admin/collections/:id/products", fetchuser, async (req, res) => {
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
app.delete("/admin/collections/:id/products", fetchuser, async (req, res) => {
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
app.post("/admin/collections/reorder", fetchuser, async (req, res) => {
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
app.post("/admin/collections/:id/toggle-visibility", fetchuser, async (req, res) => {
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
app.post("/admin/collections/upload-banner", fetchuser, upload.single('banner'), async (req, res) => {
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

// Email Notifications Management API
// Get notification settings
app.get("/admin/email/notifications", fetchuser, async (req, res) => {
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
app.post("/admin/email/notifications/settings", fetchuser, async (req, res) => {
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
app.post("/admin/email/notifications/test", fetchuser, async (req, res) => {
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
app.get("/admin/email/notifications/logs", fetchuser, async (req, res) => {
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


// For Vercel serverless functions, export the app instead of listening
module.exports = app;

// For local development, start the server
if (require.main === module) {
  app.listen(port, () => console.log("Server Running on port " + port));
}
