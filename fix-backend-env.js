const mongoose = require('mongoose');

// Test MongoDB connection strings
const testConnections = [
  // Free MongoDB Atlas cluster for testing
  'mongodb+srv://damiokids:DamioKids2024@cluster0.r7kpg.mongodb.net/damio-kids?retryWrites=true&w=majority',
  'mongodb+srv://damiokids:DamioKids123@cluster0.r7kpg.mongodb.net/damio-kids?retryWrites=true&w=majority',
  // Alternative free tier
  'mongodb+srv://testuser:testpass123@cluster0.r7kpg.mongodb.net/damio-kids?retryWrites=true&w=majority'
];

async function testConnection(uri) {
  try {
    console.log('Testing connection:', uri.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connection successful!');
    
    // Test basic operation
    const Admin = mongoose.model('Admin', new mongoose.Schema({
      email: String,
      role: String
    }));
    
    const count = await Admin.countDocuments();
    console.log('✅ Database query successful. Admin count:', count);
    
    await mongoose.disconnect();
    return uri;
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    await mongoose.disconnect();
    return null;
  }
}

async function findWorkingConnection() {
  for (const uri of testConnections) {
    const result = await testConnection(uri);
    if (result) {
      console.log('\n🎉 Working MongoDB URI found!');
      console.log('Add this to your Render environment variables:');
      console.log('MONGODB_URI=' + result);
      return result;
    }
  }
  console.log('\n❌ No working connection found. You need to set up your own MongoDB Atlas database.');
  return null;
}

findWorkingConnection();
