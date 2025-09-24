const mongoose = require('mongoose');

const genOrderNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `DK${timestamp.slice(-6)}${random}`;
};

const orderItemSchema = new mongoose.Schema({
  productId: {
    // Accept either ObjectId, string, or number; legacy storefront used numeric IDs
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  image: {
    type: String,
    required: [true, 'Product image is required']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'],
    max: [100, 'Quantity cannot exceed 100']
  },
  size: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    trim: true
  },
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative']
  }
}, {
  _id: false
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9+\-\s()]{10,15}$/, 'Please enter a valid phone number']
  },
  wilaya: {
    type: String,
    required: [true, 'Wilaya is required'],
    trim: true
  },
  commune: {
    type: String,
    required: [true, 'Commune is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  postalCode: {
    type: String,
    trim: true,
    maxlength: [10, 'Postal code cannot exceed 10 characters']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  _id: false
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    // Generate orderNumber before validation
    default: genOrderNumber
  },
  userId: {
    type: String, // Can be ObjectId for registered users or "guest" for guest orders
    required: [true, 'User ID is required']
  },
  customerInfo: {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please enter a valid email']
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[0-9+\-\s()]{10,15}$/, 'Please enter a valid phone number']
    }
  },
  items: {
    type: [orderItemSchema],
    required: [true, 'Order must contain at least one item'],
    validate: {
      validator: function(items) {
        return items.length > 0 && items.length <= 50; // Max 50 items per order
      },
      message: 'Order must contain between 1 and 50 items'
    }
  },
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative']
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: [0, 'Delivery fee cannot be negative']
  },
  total: {
    type: Number,
    required: [true, 'Total is required'],
    min: [0, 'Total cannot be negative']
  },
  shippingAddress: {
    type: shippingAddressSchema,
    required: [true, 'Shipping address is required']
  },
  deliveryType: {
    type: String,
    enum: {
      values: ['home', 'pickup'],
      message: 'Delivery type must be either home or pickup'
    },
    default: 'home',
    required: true
  },
  financials: {
    orderDiscount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    includeTaxInRevenue: { type: Boolean, default: false }
  },
  realizedRevenue: { type: Number, default: 0 },
  revenueCounted: { type: Boolean, default: false },
  paymentMethod: {
    type: String,
    enum: {
      values: ['cash_on_delivery', 'bank_transfer', 'card_payment'],
      message: 'Invalid payment method'
    },
    default: 'cash_on_delivery'
  },
  paymentStatus: {
    type: String,
    enum: {
      values: ['pending', 'paid', 'failed', 'refunded'],
      message: 'Invalid payment status'
    },
    default: 'pending'
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
      message: 'Invalid order status'
    },
    default: 'pending'
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      trim: true,
      maxlength: [200, 'Status note cannot exceed 200 characters']
    },
    updatedBy: {
      type: String,
      trim: true
    }
  }],
  trackingNumber: {
    type: String,
    trim: true,
    sparse: true, // Allow null but ensure uniqueness when present
    maxlength: [50, 'Tracking number cannot exceed 50 characters']
  },
  estimatedDeliveryDate: {
    type: Date
  },
  actualDeliveryDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Cancellation reason cannot exceed 500 characters']
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
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ userId: 1 });
orderSchema.index({ 'customerInfo.email': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ date: -1 });
orderSchema.index({ 'shippingAddress.wilaya': 1 });
orderSchema.index({ deliveryType: 1 });

// Virtual for total items count
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for order age in days
orderSchema.virtual('orderAge').get(function() {
  const now = new Date();
  const orderDate = this.date || this.createdAt;
  const diffTime = Math.abs(now - orderDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for status display
orderSchema.virtual('statusDisplay').get(function() {
  const statusDisplayMap = {
    'pending': 'Pending Confirmation',
    'confirmed': 'Confirmed',
    'processing': 'Processing',
    'shipped': 'Shipped',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
    'returned': 'Returned'
  };
  return statusDisplayMap[this.status] || this.status;
});

// Virtual for can cancel
orderSchema.virtual('canCancel').get(function() {
  return ['pending', 'confirmed'].includes(this.status);
});

// Virtual for can return
orderSchema.virtual('canReturn').get(function() {
  if (this.status !== 'delivered') return false;
  const deliveryDate = this.actualDeliveryDate || this.updatedAt;
  const daysSinceDelivery = (new Date() - deliveryDate) / (1000 * 60 * 60 * 24);
  return daysSinceDelivery <= 30; // 30 days return policy
});

// Ensure orderNumber exists before validation
orderSchema.pre('validate', function(next) {
  if (!this.orderNumber) this.orderNumber = genOrderNumber();

  // Validate total calculation
  const calculatedTotal = Number(this.subtotal || 0) + Number(this.deliveryFee || 0);
  if (Math.abs(Number(this.total || 0) - calculatedTotal) > 0.01) {
    return next(new Error('Total amount does not match subtotal + delivery fee'));
  }

  // Validate items subtotal
  const itemsSubtotal = (this.items || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  if (Math.abs(Number(this.subtotal || 0) - itemsSubtotal) > 0.01) {
    return next(new Error('Subtotal does not match items subtotal'));
  }
  next();
});

// Pre-save middleware for status/estimated delivery
orderSchema.pre('save', function(next) {
  // Add status to history if status changed
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      date: new Date(),
      updatedBy: 'system'
    });
  }

  // Set estimated delivery date for new orders
  if (this.isNew && this.deliveryType === 'home') {
    const deliveryDays = this.shippingAddress?.wilaya === 'Alger' ? 2 : 5;
    this.estimatedDeliveryDate = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000);
  }
  next();
});

// Static methods
orderSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ date: -1 });
};

orderSchema.statics.findByStatus = function(status) {
  return this.find({ status }).sort({ date: -1 });
};

orderSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

orderSchema.statics.findByWilaya = function(wilaya) {
  return this.find({ 'shippingAddress.wilaya': wilaya }).sort({ date: -1 });
};

orderSchema.statics.getOrderStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' }
      }
    }
  ]);
  
  const totalOrders = await this.countDocuments();
  const totalRevenue = await this.aggregate([
    { $match: { status: { $in: ['delivered', 'shipped'] } } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);
  
  return {
    totalOrders,
    totalRevenue: totalRevenue[0]?.total || 0,
    statusBreakdown: stats
  };
};

// Instance methods
orderSchema.methods.updateStatus = function(newStatus, note = '', updatedBy = 'system') {
  if (!['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'].includes(newStatus)) {
    throw new Error('Invalid status');
  }
  
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    date: new Date(),
    note,
    updatedBy
  });
  
  // Set actual delivery date if delivered
  if (newStatus === 'delivered' && !this.actualDeliveryDate) {
    this.actualDeliveryDate = new Date();
  }
  
  return this.save();
};

orderSchema.methods.cancel = function(reason = '', cancelledBy = 'system') {
  if (!this.canCancel) {
    throw new Error('Order cannot be cancelled in current status');
  }
  
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.statusHistory.push({
    status: 'cancelled',
    date: new Date(),
    note: reason,
    updatedBy: cancelledBy
  });
  
  return this.save();
};

orderSchema.methods.addTrackingNumber = function(trackingNumber) {
  this.trackingNumber = trackingNumber;
  if (this.status === 'confirmed' || this.status === 'processing') {
    this.status = 'shipped';
    this.statusHistory.push({
      status: 'shipped',
      date: new Date(),
      note: `Tracking number: ${trackingNumber}`,
      updatedBy: 'system'
    });
  }
  return this.save();
};

orderSchema.methods.markAsDelivered = function(deliveredBy = 'system') {
  this.status = 'delivered';
  this.actualDeliveryDate = new Date();
  this.statusHistory.push({
    status: 'delivered',
    date: new Date(),
    updatedBy: deliveredBy
  });
  return this.save();
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
