const mongoose = require('mongoose');

const metricsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  totalRevenue: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'metrics' });

module.exports = mongoose.models.Metrics || mongoose.model('Metrics', metricsSchema);