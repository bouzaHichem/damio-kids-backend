const mongoose = require('mongoose');

// Wilaya (State/Province) Model
const wilayaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Wilaya name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Wilaya name cannot exceed 50 characters'],
    minlength: [2, 'Wilaya name must be at least 2 characters']
  },
  code: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [10, 'Wilaya code cannot exceed 10 characters']
  },
  communes: [{
    type: String,
    required: [true, 'Commune name is required'],
    trim: true,
    maxlength: [50, 'Commune name cannot exceed 50 characters']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  region: {
    type: String,
    enum: {
      values: ['North', 'South', 'East', 'West', 'Center'],
      message: 'Region must be: North, South, East, West, or Center'
    },
    trim: true
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
wilayaSchema.index({ name: 1 });
wilayaSchema.index({ code: 1 });
wilayaSchema.index({ isActive: 1 });
wilayaSchema.index({ region: 1 });

// Virtuals
wilayaSchema.virtual('communeCount').get(function() {
  return this.communes ? this.communes.length : 0;
});

// Pre-save middleware
wilayaSchema.pre('save', function(next) {
  // Auto-generate code if not provided
  if (!this.code && this.name) {
    this.code = this.name
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
  }
  
  // Remove duplicate communes and sort
  if (this.communes && this.communes.length > 0) {
    this.communes = [...new Set(this.communes)].sort();
  }
  
  next();
});

// Static methods
wilayaSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

wilayaSchema.statics.findByRegion = function(region) {
  return this.find({ region, isActive: true }).sort({ name: 1 });
};

wilayaSchema.statics.findByCommune = function(commune) {
  return this.find({ communes: commune, isActive: true });
};

// Instance methods
wilayaSchema.methods.addCommune = function(communeName) {
  if (!this.communes.includes(communeName)) {
    this.communes.push(communeName);
    this.communes.sort();
  }
  return this.save();
};

wilayaSchema.methods.removeCommune = function(communeName) {
  const index = this.communes.indexOf(communeName);
  if (index > -1) {
    this.communes.splice(index, 1);
  }
  return this.save();
};

wilayaSchema.methods.updateCommunes = function(newCommunes) {
  this.communes = [...new Set(newCommunes)].sort();
  return this.save();
};

// Delivery Fee Model
const deliveryFeeSchema = new mongoose.Schema({
  wilaya: {
    type: String,
    required: [true, 'Wilaya is required'],
    trim: true,
    maxlength: [50, 'Wilaya name cannot exceed 50 characters']
  },
  commune: {
    type: String,
    required: [true, 'Commune is required'],
    trim: true,
    maxlength: [50, 'Commune name cannot exceed 50 characters']
  },
  deliveryType: {
    type: String,
    enum: {
      values: ['home', 'pickup'],
      message: 'Delivery type must be either home or pickup'
    },
    required: [true, 'Delivery type is required']
  },
  fee: {
    type: Number,
    required: [true, 'Delivery fee is required'],
    min: [0, 'Delivery fee cannot be negative'],
    max: [10000, 'Delivery fee cannot exceed 10,000']
  },
  freeDeliveryThreshold: {
    type: Number,
    min: [0, 'Free delivery threshold cannot be negative'],
    max: [100000, 'Free delivery threshold cannot exceed 100,000'],
    default: null
  },
  estimatedDays: {
    min: {
      type: Number,
      min: [1, 'Minimum delivery days must be at least 1'],
      max: [30, 'Minimum delivery days cannot exceed 30'],
      default: 1
    },
    max: {
      type: Number,
      min: [1, 'Maximum delivery days must be at least 1'],
      max: [30, 'Maximum delivery days cannot exceed 30'],
      default: 7,
      validate: {
        validator: function(maxDays) {
          return maxDays >= this.estimatedDays.min;
        },
        message: 'Maximum delivery days must be greater than or equal to minimum delivery days'
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0,
    min: [0, 'Priority cannot be negative']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [200, 'Notes cannot exceed 200 characters']
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

// Compound indexes
deliveryFeeSchema.index({ wilaya: 1, commune: 1, deliveryType: 1 }, { unique: true });
deliveryFeeSchema.index({ wilaya: 1 });
deliveryFeeSchema.index({ deliveryType: 1 });
deliveryFeeSchema.index({ isActive: 1 });
deliveryFeeSchema.index({ fee: 1 });
deliveryFeeSchema.index({ priority: 1 });

// Virtuals
deliveryFeeSchema.virtual('estimatedDeliveryDisplay').get(function() {
  if (this.estimatedDays.min === this.estimatedDays.max) {
    return `${this.estimatedDays.min} day${this.estimatedDays.min > 1 ? 's' : ''}`;
  }
  return `${this.estimatedDays.min}-${this.estimatedDays.max} days`;
});

deliveryFeeSchema.virtual('hasFreeDelivery').get(function() {
  return this.freeDeliveryThreshold && this.freeDeliveryThreshold > 0;
});

// Static methods
deliveryFeeSchema.statics.findByLocation = function(wilaya, commune, deliveryType) {
  return this.findOne({ 
    wilaya: wilaya, 
    commune: commune, 
    deliveryType: deliveryType,
    isActive: true 
  });
};

deliveryFeeSchema.statics.findByWilaya = function(wilaya) {
  return this.find({ wilaya, isActive: true }).sort({ commune: 1, deliveryType: 1 });
};

deliveryFeeSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ wilaya: 1, commune: 1, deliveryType: 1 });
};

deliveryFeeSchema.statics.calculateDeliveryFee = async function(wilaya, commune, deliveryType, orderTotal = 0) {
  const deliveryRate = await this.findByLocation(wilaya, commune, deliveryType);
  
  if (!deliveryRate) {
    return {
      success: false,
      message: 'Delivery not available for this location',
      fee: null,
      estimatedDays: null
    };
  }
  
  let fee = deliveryRate.fee;
  
  // Check for free delivery threshold
  if (deliveryRate.freeDeliveryThreshold && orderTotal >= deliveryRate.freeDeliveryThreshold) {
    fee = 0;
  }
  
  return {
    success: true,
    fee: fee,
    originalFee: deliveryRate.fee,
    estimatedDays: deliveryRate.estimatedDays,
    estimatedDeliveryDisplay: deliveryRate.estimatedDeliveryDisplay,
    freeDeliveryThreshold: deliveryRate.freeDeliveryThreshold,
    hasFreeDelivery: fee === 0 && deliveryRate.fee > 0,
    notes: deliveryRate.notes
  };
};

// Instance methods
deliveryFeeSchema.methods.updateFee = function(newFee) {
  this.fee = newFee;
  return this.save();
};

deliveryFeeSchema.methods.setFreeDeliveryThreshold = function(threshold) {
  this.freeDeliveryThreshold = threshold;
  return this.save();
};

deliveryFeeSchema.methods.updateEstimatedDays = function(minDays, maxDays) {
  this.estimatedDays.min = minDays;
  this.estimatedDays.max = maxDays || minDays;
  return this.save();
};

deliveryFeeSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

deliveryFeeSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Models
const Wilaya = mongoose.model('Wilaya', wilayaSchema);
const DeliveryFee = mongoose.model('DeliveryFee', deliveryFeeSchema);

module.exports = {
  Wilaya,
  DeliveryFee
};
