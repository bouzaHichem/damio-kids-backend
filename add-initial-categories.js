const mongoose = require('mongoose');

// MongoDB connection (using the same Atlas connection as your backend)
const mongoURI = 'mongodb+srv://Hichem:FcbMe55i10@cluster0.7mr1ww8.mongodb.net/';

// Category schema (matching your backend model)
const categorySchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  subcategories: [
    {
      id: {
        type: Number,
        required: true
      },
      name: {
        type: String,
        required: true
      }
    }
  ],
  date: {
    type: Date,
    default: Date.now
  }
});

const Category = mongoose.model('Category', categorySchema);

// Initial categories with some common subcategories
const initialCategories = [
  {
    id: 1,
    name: 'garcon',
    subcategories: [
      { id: 1, name: 'T-shirts' },
      { id: 2, name: 'Pantalons' },
      { id: 3, name: 'Chaussures' },
      { id: 4, name: 'Vestes' }
    ]
  },
  {
    id: 2,
    name: 'fille',
    subcategories: [
      { id: 1, name: 'Robes' },
      { id: 2, name: 'T-shirts' },
      { id: 3, name: 'Pantalons' },
      { id: 4, name: 'Chaussures' },
      { id: 5, name: 'Accessoires' }
    ]
  },
  {
    id: 3,
    name: 'bébé',
    subcategories: [
      { id: 1, name: 'Bodies' },
      { id: 2, name: 'Pyjamas' },
      { id: 3, name: 'Chaussures' },
      { id: 4, name: 'Accessoires' }
    ]
  }
];

async function addInitialCategories() {
  try {
    // Connect to MongoDB
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');

    // Check if categories already exist
    const existingCategories = await Category.find({});
    if (existingCategories.length > 0) {
      console.log('Categories already exist in the database:');
      existingCategories.forEach(cat => {
        console.log(`- ${cat.name} (${cat.subcategories.length} subcategories)`);
      });
      process.exit(0);
    }

    // Add initial categories
    console.log('Adding initial categories...');
    
    for (const categoryData of initialCategories) {
      const category = new Category(categoryData);
      await category.save();
      console.log(`✓ Added category: ${categoryData.name} with ${categoryData.subcategories.length} subcategories`);
    }

    console.log('\n✅ All initial categories have been added successfully!');
    
    // Verify the categories were added
    const addedCategories = await Category.find({});
    console.log(`\nTotal categories in database: ${addedCategories.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding categories:', error);
    process.exit(1);
  }
}

// Run the script
addInitialCategories();
