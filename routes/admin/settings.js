const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Admin = require('../../models/Admin');
const { requireAdminAuth } = require('../../middleware/adminAuth');
const router = express.Router();

// Configure Cloudinary (ensure your environment variables are set)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer with Cloudinary storage for profile icons
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'admin-profiles', // Folder in Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 200, height: 200, crop: 'fill', gravity: 'face' }, // Square crop focusing on face
      { quality: 'auto:good' }
    ],
    public_id: (req, file) => {
      // Generate unique filename with admin ID
      return `admin_${req.adminId}_${Date.now()}`;
    }
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// GET /api/admin/settings - Get current admin profile
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId).select('-password -loginAttempts -lockUntil');
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: admin.getPublicProfile()
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// PUT /api/admin/settings - Update admin profile
router.put('/', requireAdminAuth, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      currentPassword,
      newPassword,
      confirmPassword,
      profileIconUrl
    } = req.body;

    // Find admin with password field for verification
    const admin = await Admin.findById(req.adminId).select('+password');
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Validation object to collect errors
    const errors = {};

    // Validate required fields
    if (!firstName || firstName.trim().length === 0) {
      errors.firstName = 'First name is required';
    }
    if (!lastName || lastName.trim().length === 0) {
      errors.lastName = 'Last name is required';
    }
    if (!email || email.trim().length === 0) {
      errors.email = 'Email is required';
    }

    // Validate email format
    if (email && !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Check if email is already taken by another admin
    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: admin._id }
      });
      
      if (existingAdmin) {
        errors.email = 'Email is already registered to another admin';
      }
    }

    // Password change validation
    if (newPassword || confirmPassword) {
      if (!currentPassword) {
        errors.currentPassword = 'Current password is required to change password';
      } else {
        // Verify current password
        const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
          errors.currentPassword = 'Current password is incorrect';
        }
      }

      if (!newPassword) {
        errors.newPassword = 'New password is required';
      } else if (newPassword.length < 6) {
        errors.newPassword = 'New password must be at least 6 characters long';
      }

      if (newPassword !== confirmPassword) {
        errors.confirmPassword = 'Password confirmation does not match';
      }

      // Check if new password is same as current
      if (currentPassword && newPassword && currentPassword === newPassword) {
        errors.newPassword = 'New password must be different from current password';
      }
    }

    // Profile icon URL validation (if provided)
    if (profileIconUrl && profileIconUrl.trim().length > 0) {
      const urlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
      const cloudinaryPattern = /^https:\/\/res\.cloudinary\.com\/.+/;
      
      if (!urlPattern.test(profileIconUrl) && !cloudinaryPattern.test(profileIconUrl)) {
        errors.profileIconUrl = 'Profile icon must be a valid image URL';
      }
    }

    // Return validation errors if any
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Update admin fields
    admin.firstName = firstName.trim();
    admin.lastName = lastName.trim();
    admin.email = email.toLowerCase().trim();

    // Update profile icon if provided
    if (profileIconUrl !== undefined) {
      admin.profileIcon = profileIconUrl.trim() || null;
    }

    // Update password if provided
    if (newPassword) {
      admin.password = newPassword; // Will be hashed by pre-save middleware
    }

    // Save updated admin
    await admin.save();

    // Return updated profile (without password)
    const updatedProfile = admin.getPublicProfile();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile
    });

  } catch (error) {
    console.error('Update admin profile error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// POST /api/admin/settings/upload-avatar - Upload profile icon
router.post('/upload-avatar', requireAdminAuth, upload.single('profileIcon'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Get the uploaded image URL from Cloudinary
    const profileIconUrl = req.file.path;

    // Update admin's profile icon
    const admin = await Admin.findById(req.adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Delete previous profile icon from Cloudinary if it exists
    if (admin.profileIcon && admin.profileIcon.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = admin.profileIcon.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `admin-profiles/${filename.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.error('Error deleting previous profile icon:', deleteError);
        // Continue anyway, don't fail the upload
      }
    }

    admin.profileIcon = profileIconUrl;
    await admin.save();

    res.json({
      success: true,
      message: 'Profile icon uploaded successfully',
      data: {
        profileIcon: profileIconUrl
      }
    });

  } catch (error) {
    console.error('Upload profile icon error:', error);
    
    if (error.message === 'Only image files are allowed') {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during upload'
    });
  }
});

// DELETE /api/admin/settings/avatar - Remove profile icon
router.delete('/avatar', requireAdminAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId);
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Delete from Cloudinary if it's a Cloudinary URL
    if (admin.profileIcon && admin.profileIcon.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = admin.profileIcon.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `admin-profiles/${filename.split('.')[0]}`;
        
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.error('Error deleting profile icon from Cloudinary:', deleteError);
        // Continue anyway to remove from database
      }
    }

    // Remove profile icon from admin record
    admin.profileIcon = null;
    await admin.save();

    res.json({
      success: true,
      message: 'Profile icon removed successfully'
    });

  } catch (error) {
    console.error('Remove profile icon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB'
      });
    }
  }
  next(error);
});

module.exports = router;
