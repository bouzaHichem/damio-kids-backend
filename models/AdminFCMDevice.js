const mongoose = require('mongoose');

const AdminFCMDeviceSchema = new mongoose.Schema({
  adminId: { type: String, required: true },
  fcmToken: { type: String, required: true, unique: true, index: true },
  deviceType: { type: String, default: 'web' },
  userAgent: { type: String, default: '' },
  registeredAt: { type: Date, default: Date.now },
  lastUsed: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

let AdminFCMDevice;
try {
  AdminFCMDevice = mongoose.model('AdminFCMDevice');
} catch {
  AdminFCMDevice = mongoose.model('AdminFCMDevice', AdminFCMDeviceSchema);
}

module.exports = AdminFCMDevice;