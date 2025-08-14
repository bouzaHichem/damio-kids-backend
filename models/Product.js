const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters'],
    minlength: [2, 'Product name must be at least 2 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  image: {
    type: String,
    required: [true, 'Product image is required']
  },
  images: {
    type: [String],
    validate: {
      validator: function(images) {
        return images.length <= 10; // Maximum 10 images
      },
      message: 'Product cannot have more than 10 images'
    }
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true
  },
  new_price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative'],
    max: [1000000, 'Price cannot exceed 1,000,000']
  },
  old_price: {
    type: Number,
    min: [0, 'Old price cannot be negative'],
    max: [1000000, 'Old price cannot exceed 1,000,000'],
    validate: {
      validator: function(oldPrice) {
        return !oldPrice || oldPrice >= this.new_price;
      },
      message: 'Old price must be greater than or equal to current price'
    }
  },
  // Product variants
  sizes: {
    type: [String],
    validate: {
      validator: function(sizes) {
        const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M'];
        return sizes.every(size => validSizes.includes(size));
      },
      message: 'Invalid size option'
    }
  },
  colors: {
    type: [String],
    validate: {
      validator: function(colors) {
        return colors.every(color => color.length <= 20); // Max 20 chars per color
      },
      message: 'Color name cannot exceed 20 characters'
    }
  },
  ageRange: {
    min: {
      type: Number,
      min: [0, 'Minimum age cannot be negative'],
      max: [240, 'Minimum age cannot exceed 240 months (20 years)']
    },
    max: {
      type: Number,
      min: [0, 'Maximum age cannot be negative'],
      max: [240, 'Maximum age cannot exceed 240 months (20 years)'],
      validate: {
        validator: function(maxAge) {
          return !this.ageRange.min || maxAge >= this.ageRange.min;
        },
        message: 'Maximum age must be greater than or equal to minimum age'
      }
    }
  },
  // Additional professional fields
  brand: {
    type: String,
    trim: true,
    maxlength: [50, 'Brand name cannot exceed 50 characters']
  },
  material: {
    type: String,
    trim: true,
    maxlength: [200, 'Material description cannot exceed 200 characters']
  },
  care_instructions: {
    type: String,
    trim: true,
    maxlength: [500, 'Care instructions cannot exceed 500 characters']
  },
  weight: {
    type: Number,
    min: [0, 'Weight cannot be negative'],
    max: [50000, 'Weight cannot exceed 50kg (50000g)'] // in grams
  },
  dimensions: {
    length: {
      type: Number,
      min: [0, 'Length cannot be negative'],
      max: [1000, 'Length cannot exceed 1000 cm']
    },
    width: {
      type: Number,
      min: [0, 'Width cannot be negative'],
      max: [1000, 'Width cannot exceed 1000 cm']
    },
    height: {
      type: Number,
      min: [0, 'Height cannot be negative'],
      max: [1000, 'Height cannot exceed 1000 cm']
    }
  },
  stock_quantity: {
    type: Number,
    default: 0,
    min: [0, 'Stock quantity cannot be negative'],
    max: [10000, 'Stock quantity cannot exceed 10,000']
  },
  sku: {
    type: String,
    trim: true,
    unique: true,
    sparse: true, // Allow null values but ensure uniqueness when present
    maxlength: [50, 'SKU cannot exceed 50 characters']
  },
  tags: {
    type: [String],
    validate: {
      validator: function(tags) {
        return tags.length <= 20 && tags.every(tag => tag.length <= 30);
      },
      message: 'Cannot have more than 20 tags, and each tag cannot exceed 30 characters'
    }
  },
  // SEO fields
  meta_title: {
    type: String,
    trim: true,
    maxlength: [60, 'Meta title cannot exceed 60 characters']
  },
  meta_description: {
    type: String,
    trim: true,
    maxlength: [160, 'Meta description cannot exceed 160 characters']
  },
  // Product status
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'out_of_stock', 'discontinued'],
      message: 'Status must be: active, inactive, out_of_stock, or discontinued'
    },
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  on_sale: {
    type: Boolean,
    default: false
  },
  // Collection flags
  newCollection: {
    type: Boolean,
    default: false
  },
  popular: {
    type: Boolean,
    default: false
  },
  date: {
    type: Date,
    default: Date.now
  },
  avilable: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' }); // Text search
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ newCollection: 1 });
productSchema.index({ popular: 1 });
productSchema.index({ new_price: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ date: -1 });

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.old_price && this.old_price > this.new_price) {
    return Math.round(((this.old_price - this.new_price) / this.old_price) * 100);
  }
  return 0;
});

// Virtual for availability status
productSchema.virtual('isAvailable').get(function() {
  return this.status === 'active' && this.avilable && this.stock_quantity > 0;
});

// Virtual for age range display
productSchema.virtual('ageRangeDisplay').get(function() {
  if (!this.ageRange || (!this.ageRange.min && !this.ageRange.max)) {
    return null;
  }
  
  const formatAge = (months) => {
    if (months < 12) return `${months}M`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) return `${years}Y`;
    return `${years}Y ${remainingMonths}M`;
  };
  
  if (this.ageRange.min && this.ageRange.max) {
    return `${formatAge(this.ageRange.min)} - ${formatAge(this.ageRange.max)}`;
  }
  if (this.ageRange.min) {
    return `${formatAge(this.ageRange.min)}+`;
  }
  if (this.ageRange.max) {
    return `Up to ${formatAge(this.ageRange.max)}`;
  }
});

// Pre-save middleware
productSchema.pre('save', function(next) {
  // Auto-generate SKU if not provided
  if (!this.sku) {
    this.sku = `DK-${this.id}-${Date.now().toString().slice(-6)}`;
  }
  
  // Ensure meta_title defaults to name if not provided
  if (!this.meta_title && this.name) {
    this.meta_title = this.name.length <= 60 ? this.name : this.name.substring(0, 57) + '...';
  }
  
  // Auto-update stock status
  if (this.stock_quantity === 0) {
    this.status = 'out_of_stock';
    this.avilable = false;
  }
  
  next();
});

// Static methods
productSchema.statics.findByCategory = function(category) {
  return this.find({ 
    category: new RegExp(category, 'i'),
    status: 'active',
    avilable: true
  });
};

productSchema.statics.findFeatured = function() {
  return this.find({ 
    featured: true,
    status: 'active',
    avilable: true
  }).sort({ date: -1 });
};

productSchema.statics.findNewCollection = function() {
  return this.find({ 
    newCollection: true,
    status: 'active',
    avilable: true
  }).sort({ date: -1 });
};

productSchema.statics.findPopular = function() {
  return this.find({ 
    popular: true,
    status: 'active',
    avilable: true
  }).sort({ date: -1 });
};

productSchema.statics.findOnSale = function() {
  return this.find({ 
    on_sale: true,
    status: 'active',
    avilable: true
  }).sort({ date: -1 });
};

// Instance methods
productSchema.methods.updateStock = function(quantity) {
  this.stock_quantity = Math.max(0, this.stock_quantity + quantity);
  if (this.stock_quantity === 0) {
    this.status = 'out_of_stock';
    this.avilable = false;
  } else if (this.status === 'out_of_stock') {
    this.status = 'active';
    this.avilable = true;
  }
  return this.save();
};

productSchema.methods.setOnSale = function(isOnSale = true) {
  this.on_sale = isOnSale;
  return this.save();
};

productSchema.methods.setFeatured = function(isFeatured = true) {
  this.featured = isFeatured;
  return this.save();
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
