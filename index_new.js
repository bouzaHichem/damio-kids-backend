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

// Import middleware
const { errorHandler, notFoundHandler, asyncHandler, handleDatabaseConnection } = require('./middleware/errorHandler');
const { authenticateUser, requireAdmin } = require('./utils/auth');
const { authValidation, productValidation, orderValidation, categoryValidation, locationValidation, queryValidation } = require('./middleware/validation');

// Import models
const { User, Product, Order, Category, Wilaya, DeliveryFee, ShopImage, Collection } = require('./models');

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

// Connect to MongoDB and setup connection handlers
connectDB();
handleDatabaseConnection();

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

// Legacy authentication middleware (keeping for backward compatibility)
const fetchuser = authenticateUser;

// Routes
app.get("/", (req, res) => res.send("Damio Kids API - Server is running!"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Damio Kids API is running", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

// Authentication routes with validation
app.post('/login', authValidation.login, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase().trim() });
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
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({ 
    success: true, 
    token,
    user: user.getPublicProfile()
  });
}));

app.post('/signup', authValidation.register, asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return res.status(400).json({ success: false, errors: "User already exists" });
  }
  
  // Initialize empty cart
  let cart = {};
  for (let i = 0; i < 300; i++) cart[i] = 0;
  
  // Create new user (password will be hashed automatically by the User model)
  const user = new User({
    name: name.trim(),
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
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({ 
    success: true, 
    token,
    user: user.getPublicProfile()
  });
}));

// File upload routes with rate limiting
app.post("/upload", upload.single('product'), asyncHandler(async (req, res) => {
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
}));

app.post("/upload-multiple", upload.array('products', 5), asyncHandler(async (req, res) => {
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
}));

// Product routes with validation
app.get("/allproducts", queryValidation.pagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [products, categories, totalCount] = await Promise.all([
    Product.find({}).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
    Category.find({}),
    Product.countDocuments()
  ]);
  
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
  
  res.json({
    success: true,
    products: enhancedProducts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalProducts: totalCount,
      hasNextPage: skip + products.length < totalCount,
      hasPrevPage: parseInt(page) > 1
    }
  });
}));

// Enhanced product search with validation
app.get("/products/search", queryValidation.productSearch, asyncHandler(async (req, res) => {
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
    sortBy = 'newest',
    sortOrder = 'desc',
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
}));

// Collection-based product routes
app.get("/newcollections", asyncHandler(async (req, res) => {
  const products = await Product.findNewCollection().limit(8);
  res.json({ success: true, products });
}));

app.get("/popularinwomen", asyncHandler(async (req, res) => {
  const products = await Product.findPopular().limit(8);
  res.json({ success: true, products });
}));

app.post("/relatedproducts", asyncHandler(async (req, res) => {
  const products = await Product.findByCategory(req.body.category).limit(4);
  res.json({ success: true, products });
}));

// Admin product management with validation
app.post("/addproduct", requireAdmin, productValidation.create, asyncHandler(async (req, res) => {
  console.log("Received product data:", req.body);
  
  const products = await Product.find({});
  const id = products.length ? products[products.length - 1].id + 1 : 1;
  
  const product = new Product({ id, ...req.body });
  console.log("Attempting to save product with ID:", id);
  
  await product.save();
  console.log("Product saved successfully:", product.name);
  
  res.json({ success: true, product });
}));

app.post("/removeproduct", requireAdmin, asyncHandler(async (req, res) => {
  const product = await Product.findOneAndDelete({ id: req.body.id });
  if (!product) {
    return res.status(404).json({ success: false, message: "Product not found" });
  }
  res.json({ success: true, message: "Product deleted successfully" });
}));

// Cart management (authenticated users only)
app.post('/addtocart', authenticateUser, asyncHandler(async (req, res) => {
  const userData = await User.findById(req.user.id);
  if (!userData) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  userData.cartData[req.body.itemId] = (userData.cartData[req.body.itemId] || 0) + 1;
  await User.findByIdAndUpdate(req.user.id, { cartData: userData.cartData });
  res.json({ success: true, message: "Item added to cart" });
}));

app.post('/removefromcart', authenticateUser, asyncHandler(async (req, res) => {
  const userData = await User.findById(req.user.id);
  if (!userData) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  if (userData.cartData[req.body.itemId] > 0) {
    userData.cartData[req.body.itemId] -= 1;
  }
  await User.findByIdAndUpdate(req.user.id, { cartData: userData.cartData });
  res.json({ success: true, message: "Item removed from cart" });
}));

app.post('/getcart', authenticateUser, asyncHandler(async (req, res) => {
  const userData = await User.findById(req.user.id);
  if (!userData) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  res.json({ success: true, cartData: userData.cartData });
}));

// Keep existing order, wilaya, category, shop image, and collection routes as they are
// (They'll use the original schema definitions for backward compatibility)

// Place Order (available to all users, logged in or guest)
app.post("/placeorder", orderValidation.create, asyncHandler(async (req, res) => {
  const { items, total, address, userId, customerInfo, shippingAddress, deliveryFee } = req.body;
  
  const order = new Order({
    userId: userId || "guest",
    items,
    total,
    address, // Keep for backward compatibility
    deliveryFee: deliveryFee || 0,
    customerInfo,
    shippingAddress
  });
  
  await order.save();
  res.json({ success: true, order });
}));

// Admin Orders
app.get("/admin/orders", requireAdmin, queryValidation.pagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [orders, totalCount] = await Promise.all([
    Order.find({}).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
    Order.countDocuments()
  ]);
  
  res.json({
    success: true,
    orders,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalOrders: totalCount
    }
  });
}));

app.post("/admin/updateorder", requireAdmin, asyncHandler(async (req, res) => {
  const { orderId, status } = req.body;
  const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  res.json({ success: true, order });
}));

// Keep all existing routes for categories, wilayas, delivery fees, shop images, and collections
// These will continue to use the legacy mongoose.model definitions for backward compatibility

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// For Vercel serverless functions, export the app instead of listening
module.exports = app;

// For local development, start the server
if (require.main === module) {
  app.listen(port, () => console.log(`Server Running on port ${port}`));
}
