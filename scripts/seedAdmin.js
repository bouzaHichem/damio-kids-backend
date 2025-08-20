require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

// Admin seed data
const adminSeedData = {
  email: 'admin@damiokids.com',
  password: 'AdminPassword123!', // Will be hashed automatically
  firstName: 'Admin',
  lastName: 'User',
  profileIcon: null, // No initial profile icon
  role: 'super_admin',
  isActive: true
};

async function seedAdmin() {
  try {
    console.log('🌱 Starting admin seeding process...');
    
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/damio-kids";
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminSeedData.email });
    
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email:', adminSeedData.email);
      console.log('Admin details:', {
        email: existingAdmin.email,
        role: existingAdmin.role,
        isActive: existingAdmin.isActive,
        createdAt: existingAdmin.createdAt
      });
      
      // Ask if they want to update the existing admin
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise((resolve) => {
        rl.question('Do you want to update the existing admin password? (y/N): ', resolve);
      });
      
      rl.close();
      
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        existingAdmin.password = adminSeedData.password; // Will be hashed automatically
        existingAdmin.isActive = true;
        existingAdmin.loginAttempts = 0;
        existingAdmin.lockUntil = undefined;
        
        await existingAdmin.save();
        console.log('✅ Admin password updated successfully!');
      } else {
        console.log('ℹ️  Admin seeding cancelled.');
      }
      
      process.exit(0);
    }
    
    // Create new admin
    console.log('👤 Creating new admin user...');
    
    const newAdmin = new Admin(adminSeedData);
    const savedAdmin = await newAdmin.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('Admin details:', {
      id: savedAdmin._id,
      email: savedAdmin.email,
      firstName: savedAdmin.firstName,
      lastName: savedAdmin.lastName,
      role: savedAdmin.role,
      permissions: savedAdmin.permissions,
      isActive: savedAdmin.isActive,
      createdAt: savedAdmin.createdAt
    });
    
    console.log('🔑 Login credentials:');
    console.log('Email:', adminSeedData.email);
    console.log('Password:', adminSeedData.password);
    console.log('');
    console.log('⚠️  IMPORTANT: Please change this password after first login!');
    
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    
    if (error.code === 11000) {
      console.log('ℹ️  Admin with this email already exists');
    }
    
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the seeding function
if (require.main === module) {
  seedAdmin();
}

module.exports = seedAdmin;
