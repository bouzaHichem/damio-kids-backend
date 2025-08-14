const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: formattedErrors
    });
  }
  
  next();
};

// Custom validators
const customValidators = {
  isObjectId: (value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error('Invalid ObjectId format');
    }
    return true;
  },
  
  isPositiveNumber: (value) => {
    if (value <= 0) {
      throw new Error('Must be a positive number');
    }
    return true;
  },
  
  isStrongPassword: (value) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSpecialChar = /[@$!%*?&]/.test(value);
    
    if (value.length < minLength) {
      throw new Error(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
      throw new Error('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
      throw new Error('Password must contain at least one special character (@$!%*?&)');
    }
    
    return true;
  },
  
  isValidSlug: (value) => {
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(value)) {
      throw new Error('Slug can only contain lowercase letters, numbers, and hyphens');
    }
    return true;
  },
  
  isValidImageUrl: (value) => {
    const imageUrlRegex = /\.(jpg|jpeg|png|webp|gif)$/i;
    if (!imageUrlRegex.test(value)) {
      throw new Error('Must be a valid image URL (jpg, jpeg, png, webp, gif)');
    }
    return true;
  },
  
  isValidPhoneNumber: (value) => {
    const phoneRegex = /^[0-9+\-\s()]{10,15}$/;
    if (!phoneRegex.test(value)) {
      throw new Error('Please enter a valid phone number');
    }
    return true;
  }
};

// Authentication validation
const authValidation = {
  register: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Name can only contain letters and spaces'),
    
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    body('password')
      .custom(customValidators.isStrongPassword),
    
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password');
        }
        return true;
      }),
    
    handleValidationErrors
  ],
  
  login: [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required'),
    
    handleValidationErrors
  ],
  
  changePassword: [
    body('currentPassword')
      .isLength({ min: 1 })
      .withMessage('Current password is required'),
    
    body('newPassword')
      .custom(customValidators.isStrongPassword),
    
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password confirmation does not match new password');
        }
        return true;
      }),
    
    handleValidationErrors
  ]
};

// Product validation
const productValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Product name must be between 2 and 100 characters'),
    
    body('description')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    
    body('image')
      .isURL()
      .withMessage('Image must be a valid URL')
      .custom(customValidators.isValidImageUrl),
    
    body('images')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 images allowed'),
    
    body('images.*')
      .isURL()
      .withMessage('All images must be valid URLs')
      .custom(customValidators.isValidImageUrl),
    
    body('category')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Category must be between 2 and 50 characters'),
    
    body('new_price')
      .isNumeric()
      .withMessage('Price must be a number')
      .custom(customValidators.isPositiveNumber),
    
    body('old_price')
      .optional()
      .isNumeric()
      .withMessage('Old price must be a number')
      .custom((value, { req }) => {
        if (value && value < req.body.new_price) {
          throw new Error('Old price must be greater than or equal to current price');
        }
        return true;
      }),
    
    body('sizes')
      .optional()
      .isArray()
      .withMessage('Sizes must be an array'),
    
    body('colors')
      .optional()
      .isArray()
      .withMessage('Colors must be an array'),
    
    body('stock_quantity')
      .optional()
      .isInt({ min: 0, max: 10000 })
      .withMessage('Stock quantity must be between 0 and 10,000'),
    
    body('brand')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Brand name cannot exceed 50 characters'),
    
    body('sku')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('SKU cannot exceed 50 characters'),
    
    handleValidationErrors
  ],
  
  update: [
    param('id')
      .isNumeric()
      .withMessage('Product ID must be a number'),
    
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Product name must be between 2 and 100 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    
    body('new_price')
      .optional()
      .isNumeric()
      .withMessage('Price must be a number')
      .custom(customValidators.isPositiveNumber),
    
    handleValidationErrors
  ],
  
  getById: [
    param('id')
      .isNumeric()
      .withMessage('Product ID must be a number'),
    
    handleValidationErrors
  ]
};

// Order validation
const orderValidation = {
  create: [
    body('items')
      .isArray({ min: 1, max: 50 })
      .withMessage('Order must contain between 1 and 50 items'),
    
    body('items.*.productId')
      .custom(customValidators.isObjectId),
    
    body('items.*.name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Product name must be between 2 and 100 characters'),
    
    body('items.*.quantity')
      .isInt({ min: 1, max: 100 })
      .withMessage('Quantity must be between 1 and 100'),
    
    body('items.*.price')
      .isNumeric()
      .withMessage('Price must be a number')
      .custom(customValidators.isPositiveNumber),
    
    body('customerInfo.name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Customer name must be between 2 and 100 characters'),
    
    body('customerInfo.email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    body('customerInfo.phone')
      .custom(customValidators.isValidPhoneNumber),
    
    body('shippingAddress.fullName')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),
    
    body('shippingAddress.phone')
      .custom(customValidators.isValidPhoneNumber),
    
    body('shippingAddress.wilaya')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Wilaya must be between 2 and 50 characters'),
    
    body('shippingAddress.commune')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Commune must be between 2 and 50 characters'),
    
    body('shippingAddress.address')
      .trim()
      .isLength({ min: 10, max: 200 })
      .withMessage('Address must be between 10 and 200 characters'),
    
    body('deliveryType')
      .isIn(['home', 'pickup'])
      .withMessage('Delivery type must be either home or pickup'),
    
    body('paymentMethod')
      .optional()
      .isIn(['cash_on_delivery', 'bank_transfer', 'card_payment'])
      .withMessage('Invalid payment method'),
    
    body('subtotal')
      .isNumeric()
      .withMessage('Subtotal must be a number')
      .custom(customValidators.isPositiveNumber),
    
    body('deliveryFee')
      .optional()
      .isNumeric({ min: 0 })
      .withMessage('Delivery fee must be a non-negative number'),
    
    body('total')
      .isNumeric()
      .withMessage('Total must be a number')
      .custom(customValidators.isPositiveNumber),
    
    handleValidationErrors
  ],
  
  updateStatus: [
    param('id')
      .custom(customValidators.isObjectId),
    
    body('status')
      .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'])
      .withMessage('Invalid order status'),
    
    body('note')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Note cannot exceed 200 characters'),
    
    handleValidationErrors
  ]
};

// Category validation
const categoryValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Category name must be between 2 and 50 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
    
    body('subcategories')
      .optional()
      .isArray()
      .withMessage('Subcategories must be an array'),
    
    body('subcategories.*.name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Subcategory name must be between 2 and 50 characters'),
    
    handleValidationErrors
  ],
  
  update: [
    param('id')
      .isNumeric()
      .withMessage('Category ID must be a number'),
    
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Category name must be between 2 and 50 characters'),
    
    handleValidationErrors
  ]
};

// Location validation
const locationValidation = {
  createWilaya: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Wilaya name must be between 2 and 50 characters'),
    
    body('communes')
      .isArray({ min: 1 })
      .withMessage('At least one commune is required'),
    
    body('communes.*')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Commune name must be between 2 and 50 characters'),
    
    body('region')
      .optional()
      .isIn(['North', 'South', 'East', 'West', 'Center'])
      .withMessage('Region must be: North, South, East, West, or Center'),
    
    handleValidationErrors
  ],
  
  createDeliveryFee: [
    body('wilaya')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Wilaya name must be between 2 and 50 characters'),
    
    body('commune')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Commune name must be between 2 and 50 characters'),
    
    body('deliveryType')
      .isIn(['home', 'pickup'])
      .withMessage('Delivery type must be either home or pickup'),
    
    body('fee')
      .isNumeric({ min: 0, max: 10000 })
      .withMessage('Delivery fee must be between 0 and 10,000'),
    
    body('estimatedDays.min')
      .optional()
      .isInt({ min: 1, max: 30 })
      .withMessage('Minimum delivery days must be between 1 and 30'),
    
    body('estimatedDays.max')
      .optional()
      .isInt({ min: 1, max: 30 })
      .withMessage('Maximum delivery days must be between 1 and 30'),
    
    handleValidationErrors
  ]
};

// Collection validation
const collectionValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Collection name must be between 2 and 100 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),
    
    body('bannerImage')
      .optional()
      .isURL()
      .withMessage('Banner image must be a valid URL'),
    
    body('products')
      .optional()
      .isArray()
      .withMessage('Products must be an array'),
    
    body('products.*')
      .custom(customValidators.isObjectId),
    
    handleValidationErrors
  ]
};

// Shop image validation
const shopImageValidation = {
  create: [
    body('title')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Title must be between 2 and 100 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
    
    body('imageType')
      .isIn(['hero', 'category', 'promotional', 'feature', 'banner', 'gallery'])
      .withMessage('Invalid image type'),
    
    body('category')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Category cannot exceed 50 characters'),
    
    handleValidationErrors
  ]
};

// Query parameter validation
const queryValidation = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be between 1 and 1000'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    handleValidationErrors
  ],
  
  productSearch: [
    query('q')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),
    
    query('category')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Category must be between 1 and 50 characters'),
    
    query('minPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum price must be non-negative'),
    
    query('maxPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum price must be non-negative'),
    
    query('sortBy')
      .optional()
      .isIn(['name', 'price', 'date', 'popular', 'newest'])
      .withMessage('Invalid sort option'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
    
    handleValidationErrors
  ]
};

// Generic ID validation
const idValidation = {
  objectId: [
    param('id')
      .custom(customValidators.isObjectId),
    
    handleValidationErrors
  ],
  
  numericId: [
    param('id')
      .isNumeric()
      .withMessage('ID must be a number'),
    
    handleValidationErrors
  ]
};

module.exports = {
  handleValidationErrors,
  customValidators,
  authValidation,
  productValidation,
  orderValidation,
  categoryValidation,
  locationValidation,
  collectionValidation,
  shopImageValidation,
  queryValidation,
  idValidation
};
