require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Import improved configurations
const corsConfig = require('./cors-config');
const { fetchuser, requireAdmin } = require('./auth-middleware');

const port = process.env.PORT || 4000;

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Rate limiting configuration
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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

// Use improved CORS configuration
app.use(cors(corsConfig));

// Add OPTIONS handler for preflight requests
app.options('*', cors(corsConfig));

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
    
    await mongoose.connect(mongoURI || 'mongodb://localhost:27017/damio-kids', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log("MongoDB Connected:");
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
  console.log('MongoDB connection established successfully!');
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

// Import models
const Users = require('./models/User');

const Product = mongoose.model('Product', {
  id: Number,
  name: String,
  description: String,
  image: String,
  images: [String],
  category: String,
  new_price: Number,
  old_price: Number,
  sizes: [String],
  colors: [String],
  ageRange: {
    min: Number,
    max: Number
  },
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
  meta_title: String,
  meta_description: String,
  status: { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
  featured: { type: Boolean, default: false },
  on_sale: { type: Boolean, default: false },
  newCollection: { type: Boolean, default: false },
  popular: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  avilable: { type: Boolean, default: true }
});

const Order = mongoose.model('Order', {
  userId: String,
  items: Array,
  total: Number,
  deliveryFee: { type: Number, default: 0 },
  address: String,
  wilaya: String,
  commune: String,
  deliveryType: { type: String, enum: ['home', 'pickup'], default: 'home' },
  status: { type: String, default: 'Pending' },
  date: { type: Date, default: Date.now }
});

const DeliveryFee = mongoose.model('DeliveryFee', {
  wilaya: { type: String, required: true },
  commune: { type: String, required: true },
  deliveryType: { type: String, enum: ['home', 'pickup'], required: true },
  fee: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

const Wilaya = mongoose.model('Wilaya', {
  name: { type: String, required: true, unique: true },
  communes: [{ type: String, required: true }],
  date: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', {
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  subcategories: [{
    id: { type: Number, required: true },
    name: { type: String, required: true }
  }],
  date: { type: Date, default: Date.now }
});

const ShopImage = mongoose.model('ShopImage', {
  id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  image: { type: String, required: true },
  imageType: { type: String, enum: ['hero', 'category', 'promotional', 'feature'], required: true },
  category: { type: String },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
});

const Collection = mongoose.model('Collection', {
  name: String,
  bannerImage: String,
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isVisible: { type: Boolean, default: true },
  order: Number,
});

// Health and status routes
app.get('/', (req, res) => res.send('Damio Kids API - Server is running!'));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Damio Kids API is running', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Authentication routes
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, errors: 'Email and password are required' });
    }
    
    const user = await Users.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, errors: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ success: false, errors: 'Account is deactivated' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, errors: 'Invalid credentials' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    // Ensure JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not defined');
      return res.status(500).json({ success: false, errors: 'Server configuration error' });
    }
    
    const token = jwt.sign(
      { user: { id: user._id, role: user.role } },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // Add token expiration
    );
    
    console.log("User logged in:", user.email);
    
    res.json({ 
      success: true, 
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, errors: 'Internal server error' });
  }
});

app.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, errors: 'All fields are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, errors: 'Password must be at least 8 characters long' });
    }
    
    const existingUser = await Users.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, errors: 'User already exists' });
    }
    
    let cart = {};
    for (let i = 0; i < 300; i++) cart[i] = 0;
    
    const user = new Users({
      name: username.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      cartData: cart,
      isActive: true,
      emailVerified: false
    });
    
    await user.save();
    
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not defined');
      return res.status(500).json({ success: false, errors: 'Server configuration error' });
    }
    
    const token = jwt.sign(
      { user: { id: user._id, role: user.role } },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log("User registered:", user.email);
    
    res.json({ 
      success: true, 
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, errors: 'Internal server error' });
  }
});

// Continue with the rest of your routes...
// (The remaining routes stay the same, just use the improved fetchuser from auth-middleware)

// Upload routes
app.post('/upload', upload.single('product'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: 0, message: 'No file uploaded' });
    }

    let imageUrl;
    if (process.env.NODE_ENV === 'production' && req.file.path) {
      imageUrl = req.file.path;
    } else {
      imageUrl = /images/;
    }

    res.json({ success: 1, image_url: imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: 0, message: 'Upload failed', error: error.message });
  }
});

app.post('/upload-multiple', upload.array('products', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: 0, message: 'No files uploaded' });
    }
    
    let imageUrls;
    if (process.env.NODE_ENV === 'production') {
      imageUrls = req.files.map(file => file.path);
    } else {
      imageUrls = req.files.map(file => /images/);
    }
    
    res.json({ success: 1, image_urls: imageUrls });
  } catch (error) {
    console.error('Upload multiple error:', error);
    res.status(500).json({ success: 0, message: 'Upload failed', error: error.message });
  }
});

// Product routes
app.get('/allproducts', async (req, res) => {
  try {
    const products = await Product.find({});
    const categories = await Category.find({});
    
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
    
    res.send(enhancedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add all your other existing routes here...
// For brevity, I'm not including them all, but they should remain the same

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, errors: 'Invalid ID format' });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, errors: err.message });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({ success: false, errors: 'Duplicate field value' });
  }
  
  res.status(500).json({ 
    success: false, 
    errors: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, errors: "Route not found" });
});


// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(false, () => {
    console.log('MongoDB connection closed.');
    process.exit(0);
  });
});

// For Vercel serverless functions, export the app instead of listening
module.exports = app;

// For local development, start the server
if (require.main === module) {
  app.listen(port, () => console.log('Server Running on port ' + port));
}
