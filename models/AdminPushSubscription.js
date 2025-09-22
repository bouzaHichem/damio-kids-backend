const mongoose = require('mongoose');

const AdminPushSubscriptionSchema = new mongoose.Schema({
  adminId: { type: String, required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  deviceType: { type: String, default: 'web' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});

let AdminPushSubscription;
try {
  AdminPushSubscription = mongoose.model('AdminPushSubscription');
} catch {
  AdminPushSubscription = mongoose.model('AdminPushSubscription', AdminPushSubscriptionSchema);
}

module.exports = AdminPushSubscription;