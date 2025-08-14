const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  id: {
    type: Number,
    required: [true, 'Subcategory ID is required']
  },
  name: {
    type: String,
    required: [true, 'Subcategory name is required'],
    trim: true,
    maxlength: [50, 'Subcategory name cannot exceed 50 characters'],
    minlength: [2, 'Subcategory name must be at least 2 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Subcategory description cannot exceed 200 characters']
  },
  image: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  _id: false
});

const categorySchema = new mongoose.Schema({
  id: {
    type: Number,
    required: [true, 'Category ID is required'],
    unique: true,
    min: [1, 'Category ID must be positive']
  },
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters'],
    minlength: [2, 'Category name must be at least 2 characters']
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
    maxlength: [500, 'Category description cannot exceed 500 characters']
  },
  image: {
    type: String,
    trim: true
  },
  icon: {
    type: String,
    trim: true
  },
  subcategories: {
    type: [subcategorySchema],
    validate: {
      validator: function(subcategories) {
        // Check for duplicate subcategory IDs
        const ids = subcategories.map(sub => sub.id);
        const uniqueIds = [...new Set(ids)];
        return ids.length === uniqueIds.length;
      },
      message: 'Subcategory IDs must be unique within a category'
    }
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0,
    min: [0, 'Category level cannot be negative'],
    max: [3, 'Category level cannot exceed 3']
  },
  order: {
    type: Number,
    default: 0,
    min: [0, 'Order cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  // SEO fields
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
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 });
categorySchema.index({ parentCategory: 1 });
categorySchema.index({ level: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ isFeatured: 1 });
categorySchema.index({ order: 1 });
categorySchema.index({ date: -1 });

// Virtual for product count (requires separate query)
categorySchema.virtual('productCount', {
  ref: 'Product',
  localField: 'name',
  foreignField: 'category',
  count: true
});

// Virtual for full path (for breadcrumbs)
categorySchema.virtual('fullPath').get(function() {
  // This would need to be populated with parent categories in practice
  return this.name;
});

// Virtual for subcategory count
categorySchema.virtual('subcategoryCount').get(function() {
  return this.subcategories ? this.subcategories.filter(sub => sub.isActive).length : 0;
});

// Virtual for has active subcategories
categorySchema.virtual('hasActiveSubcategories').get(function() {
  return this.subcategories && this.subcategories.some(sub => sub.isActive);
});

// Pre-save middleware
categorySchema.pre('save', function(next) {
  // Auto-generate slug if not provided
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .trim();
  }
  
  // Set meta title if not provided
  if (!this.meta.title) {
    this.meta.title = this.name.length <= 60 ? this.name : this.name.substring(0, 57) + '...';
  }
  
  // Ensure subcategory IDs are unique and sequential
  if (this.subcategories && this.subcategories.length > 0) {
    this.subcategories.sort((a, b) => a.id - b.id);
  }
  
  next();
});

// Pre-remove middleware
categorySchema.pre('remove', async function(next) {
  // Check if category has products
  const Product = mongoose.model('Product');
  const productCount = await Product.countDocuments({ category: this.name });
  
  if (productCount > 0) {
    return next(new Error('Cannot delete category that contains products. Move products to another category first.'));
  }
  
  next();
});

// Static methods
categorySchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ order: 1, name: 1 });
};

categorySchema.statics.findFeatured = function() {
  return this.find({ isFeatured: true, isActive: true }).sort({ order: 1, name: 1 });
};

categorySchema.statics.findByLevel = function(level) {
  return this.find({ level, isActive: true }).sort({ order: 1, name: 1 });
};

categorySchema.statics.findMainCategories = function() {
  return this.find({ parentCategory: null, isActive: true }).sort({ order: 1, name: 1 });
};

categorySchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

categorySchema.statics.getCategoryHierarchy = async function() {
  const categories = await this.find({ isActive: true }).sort({ level: 1, order: 1, name: 1 });
  
  // Build hierarchy tree
  const categoryMap = new Map();
  const rootCategories = [];
  
  // First pass: create map of all categories
  categories.forEach(category => {
    categoryMap.set(category._id.toString(), {
      ...category.toObject(),
      children: []
    });
  });
  
  // Second pass: build hierarchy
  categories.forEach(category => {
    const categoryObj = categoryMap.get(category._id.toString());
    
    if (category.parentCategory) {
      const parent = categoryMap.get(category.parentCategory.toString());
      if (parent) {
        parent.children.push(categoryObj);
      }
    } else {
      rootCategories.push(categoryObj);
    }
  });
  
  return rootCategories;
};

// Instance methods
categorySchema.methods.addSubcategory = function(subcategoryData) {
  // Get next subcategory ID
  const nextId = this.subcategories.length > 0 
    ? Math.max(...this.subcategories.map(sub => sub.id)) + 1 
    : 1;
  
  const subcategory = {
    id: nextId,
    name: subcategoryData.name,
    description: subcategoryData.description || '',
    image: subcategoryData.image || '',
    isActive: subcategoryData.isActive !== undefined ? subcategoryData.isActive : true
  };
  
  this.subcategories.push(subcategory);
  return this.save();
};

categorySchema.methods.updateSubcategory = function(subcategoryId, updateData) {
  const subcategory = this.subcategories.find(sub => sub.id === subcategoryId);
  
  if (!subcategory) {
    throw new Error('Subcategory not found');
  }
  
  // Update allowed fields
  if (updateData.name) subcategory.name = updateData.name;
  if (updateData.description !== undefined) subcategory.description = updateData.description;
  if (updateData.image !== undefined) subcategory.image = updateData.image;
  if (updateData.isActive !== undefined) subcategory.isActive = updateData.isActive;
  
  return this.save();
};

categorySchema.methods.removeSubcategory = function(subcategoryId) {
  const index = this.subcategories.findIndex(sub => sub.id === subcategoryId);
  
  if (index === -1) {
    throw new Error('Subcategory not found');
  }
  
  this.subcategories.splice(index, 1);
  return this.save();
};

categorySchema.methods.reorderSubcategories = function(subcategoryOrders) {
  // subcategoryOrders should be an array of { id, order } objects
  subcategoryOrders.forEach(orderItem => {
    const subcategory = this.subcategories.find(sub => sub.id === orderItem.id);
    if (subcategory) {
      subcategory.order = orderItem.order;
    }
  });
  
  // Sort subcategories by order
  this.subcategories.sort((a, b) => (a.order || 0) - (b.order || 0));
  
  return this.save();
};

categorySchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

categorySchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

categorySchema.methods.setFeatured = function(featured = true) {
  this.isFeatured = featured;
  return this.save();
};

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
