const mongoose = require('mongoose');

// Shop Image Model
const shopImageSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: [true, 'Shop image ID is required'],
    unique: true,
    min: [1, 'ID must be positive']
  },
  title: {
    type: String,
    required: [true, 'Image title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
    minlength: [2, 'Title must be at least 2 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  image: {
    type: String,
    required: [true, 'Image URL is required'],
    trim: true
  },
  imageType: {
    type: String,
    enum: {
      values: ['hero', 'category', 'promotional', 'feature', 'banner', 'gallery'],
      message: 'Invalid image type'
    },
    required: [true, 'Image type is required']
  },
  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  visible: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0,
    min: [0, 'Order cannot be negative']
  },
  // Additional metadata
  alt: {
    type: String,
    trim: true,
    maxlength: [200, 'Alt text cannot exceed 200 characters']
  },
  tags: {
    type: [String],
    validate: {
      validator: function(tags) {
        return tags.length <= 10 && tags.every(tag => tag.length <= 30);
      },
      message: 'Cannot have more than 10 tags, and each tag cannot exceed 30 characters'
    }
  },
  // Link configuration for clickable images
  link: {
    url: {
      type: String,
      trim: true,
      maxlength: [500, 'Link URL cannot exceed 500 characters']
    },
    target: {
      type: String,
      enum: ['_self', '_blank'],
      default: '_self'
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Link title cannot exceed 100 characters']
    }
  },
  // Display settings
  displaySettings: {
    showTitle: {
      type: Boolean,
      default: true
    },
    showDescription: {
      type: Boolean,
      default: true
    },
    overlay: {
      type: String,
      enum: ['none', 'dark', 'light', 'gradient'],
      default: 'none'
    },
    textPosition: {
      type: String,
      enum: ['center', 'top', 'bottom', 'left', 'right'],
      default: 'center'
    }
  },
  // Size and dimensions (optional, for responsive images)
  dimensions: {
    width: {
      type: Number,
      min: [1, 'Width must be positive']
    },
    height: {
      type: Number,
      min: [1, 'Height must be positive']
    }
  },
  fileSize: {
    type: Number,
    min: [0, 'File size cannot be negative']
  },
  mimeType: {
    type: String,
    enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    default: 'image/jpeg'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users'
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
shopImageSchema.index({ id: 1 }, { unique: true });
shopImageSchema.index({ imageType: 1 });
shopImageSchema.index({ category: 1 });
shopImageSchema.index({ visible: 1 });
shopImageSchema.index({ order: 1 });
shopImageSchema.index({ tags: 1 });
shopImageSchema.index({ date: -1 });

// Virtuals
shopImageSchema.virtual('isClickable').get(function() {
  return this.link && this.link.url && this.link.url.trim().length > 0;
});

shopImageSchema.virtual('displayName').get(function() {
  return this.alt || this.title;
});

// Pre-save middleware
shopImageSchema.pre('save', function(next) {
  // Set alt text if not provided
  if (!this.alt && this.title) {
    this.alt = this.title;
  }
  
  // Clean tags
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags.map(tag => tag.trim().toLowerCase()).filter(Boolean);
    this.tags = [...new Set(this.tags)]; // Remove duplicates
  }
  
  next();
});

// Static methods
shopImageSchema.statics.findByType = function(imageType) {
  return this.find({ 
    imageType, 
    visible: true 
  }).sort({ order: 1, date: -1 });
};

shopImageSchema.statics.findVisible = function() {
  return this.find({ visible: true }).sort({ imageType: 1, order: 1 });
};

shopImageSchema.statics.findByCategory = function(category) {
  return this.find({ 
    category: new RegExp(category, 'i'), 
    visible: true 
  }).sort({ order: 1 });
};

shopImageSchema.statics.findByTag = function(tag) {
  return this.find({ 
    tags: tag, 
    visible: true 
  }).sort({ order: 1 });
};

// Instance methods
shopImageSchema.methods.show = function() {
  this.visible = true;
  return this.save();
};

shopImageSchema.methods.hide = function() {
  this.visible = false;
  return this.save();
};

shopImageSchema.methods.updateOrder = function(newOrder) {
  this.order = newOrder;
  return this.save();
};

shopImageSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag.toLowerCase().trim())) {
    this.tags.push(tag.toLowerCase().trim());
  }
  return this.save();
};

shopImageSchema.methods.removeTag = function(tag) {
  const index = this.tags.indexOf(tag.toLowerCase().trim());
  if (index > -1) {
    this.tags.splice(index, 1);
  }
  return this.save();
};

// Collection Model
const collectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Collection name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Collection name cannot exceed 100 characters'],
    minlength: [2, 'Collection name must be at least 2 characters']
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  bannerImage: {
    type: String,
    trim: true
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  isVisible: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0,
    min: [0, 'Order cannot be negative']
  },
  // Collection metadata
  meta: {
    title: {
      type: String,
      trim: true,
      maxlength: [60, 'Meta title cannot exceed 60 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [160, 'Meta description cannot exceed 160 characters']
    },
    keywords: {
      type: [String],
      validate: {
        validator: function(keywords) {
          return keywords.length <= 10 && keywords.every(keyword => keyword.length <= 30);
        },
        message: 'Cannot have more than 10 keywords, and each keyword cannot exceed 30 characters'
      }
    }
  },
  // Display settings
  displaySettings: {
    layout: {
      type: String,
      enum: ['grid', 'list', 'masonry', 'carousel'],
      default: 'grid'
    },
    productsPerRow: {
      type: Number,
      min: [1, 'Products per row must be at least 1'],
      max: [6, 'Products per row cannot exceed 6'],
      default: 3
    },
    showDescription: {
      type: Boolean,
      default: true
    },
    showPrices: {
      type: Boolean,
      default: true
    }
  },
  // Collection dates
  startDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  // Statistics
  viewCount: {
    type: Number,
    default: 0,
    min: [0, 'View count cannot be negative']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users'
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
collectionSchema.index({ name: 1 }, { unique: true });
collectionSchema.index({ slug: 1 }, { unique: true });
collectionSchema.index({ isVisible: 1 });
collectionSchema.index({ isFeatured: 1 });
collectionSchema.index({ order: 1 });
collectionSchema.index({ startDate: 1, endDate: 1 });
collectionSchema.index({ date: -1 });

// Virtuals
collectionSchema.virtual('productCount').get(function() {
  return this.products ? this.products.length : 0;
});

collectionSchema.virtual('isActive').get(function() {
  const now = new Date();
  
  // Check if collection is within date range (if dates are set)
  if (this.startDate && now < this.startDate) return false;
  if (this.endDate && now > this.endDate) return false;
  
  return this.isVisible;
});

collectionSchema.virtual('status').get(function() {
  const now = new Date();
  
  if (!this.isVisible) return 'hidden';
  if (this.startDate && now < this.startDate) return 'scheduled';
  if (this.endDate && now > this.endDate) return 'expired';
  
  return 'active';
});

// Pre-save middleware
collectionSchema.pre('save', function(next) {
  // Auto-generate slug if not provided
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  
  // Set meta title if not provided
  if (!this.meta.title) {
    this.meta.title = this.name.length <= 60 ? this.name : this.name.substring(0, 57) + '...';
  }
  
  // Validate date range
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    return next(new Error('Start date must be before end date'));
  }
  
  next();
});

// Static methods
collectionSchema.statics.findVisible = function() {
  return this.find({ isVisible: true }).sort({ order: 1, date: -1 });
};

collectionSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    isVisible: true,
    $or: [
      { startDate: null },
      { startDate: { $lte: now } }
    ],
    $or: [
      { endDate: null },
      { endDate: { $gte: now } }
    ]
  }).sort({ order: 1, date: -1 });
};

collectionSchema.statics.findFeatured = function() {
  return this.find({ 
    isFeatured: true, 
    isVisible: true 
  }).sort({ order: 1, date: -1 });
};

collectionSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isVisible: true });
};

// Instance methods
collectionSchema.methods.addProduct = function(productId) {
  if (!this.products.includes(productId)) {
    this.products.push(productId);
  }
  return this.save();
};

collectionSchema.methods.removeProduct = function(productId) {
  const index = this.products.indexOf(productId);
  if (index > -1) {
    this.products.splice(index, 1);
  }
  return this.save();
};

collectionSchema.methods.updateProducts = function(productIds) {
  this.products = [...new Set(productIds)]; // Remove duplicates
  return this.save();
};

collectionSchema.methods.show = function() {
  this.isVisible = true;
  return this.save();
};

collectionSchema.methods.hide = function() {
  this.isVisible = false;
  return this.save();
};

collectionSchema.methods.setFeatured = function(featured = true) {
  this.isFeatured = featured;
  return this.save();
};

collectionSchema.methods.incrementView = function() {
  this.viewCount += 1;
  return this.save();
};

collectionSchema.methods.setDateRange = function(startDate, endDate) {
  this.startDate = startDate;
  this.endDate = endDate;
  return this.save();
};

collectionSchema.methods.clearDateRange = function() {
  this.startDate = null;
  this.endDate = null;
  return this.save();
};

// Models
const ShopImage = mongoose.model('ShopImage', shopImageSchema);
const Collection = mongoose.model('Collection', collectionSchema);

module.exports = {
  ShopImage,
  Collection
};
