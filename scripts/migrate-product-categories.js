#!/usr/bin/env node
/*
  Migration: backfill Product.categoryId (ObjectId) and subcategoryId (Number)
  - If product.category is a 24-char hex string, assume it's a Category _id and copy to categoryId
  - Else if product.category is a name, find Category by name and set categoryId
  - For subcategory: if numeric string, parse to Number; if a name, resolve by matching Category.subcategories[].name

  Usage:
    MONGODB_URI="mongodb+srv://..." node scripts/migrate-product-categories.js
*/

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI env variable');
    process.exit(1);
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  const Product = mongoose.model('Product');
  const Category = mongoose.model('Category');

  const categories = await Category.find({}).lean();
  const idMap = new Map(categories.map(c => [String(c._id), c]));
  const nameMap = new Map(categories.map(c => [c.name, c]));

  const products = await Product.find({}).lean();
  let updated = 0;

  for (const p of products) {
    let set = {};
    // Category
    let catDoc = null;
    if (p.categoryId) {
      catDoc = idMap.get(String(p.categoryId));
    }
    if (!catDoc && typeof p.category === 'string' && /^[0-9a-fA-F]{24}$/.test(p.category)) {
      catDoc = idMap.get(p.category);
      if (catDoc) set.categoryId = catDoc._id;
    }
    if (!catDoc && typeof p.category === 'string' && p.category) {
      catDoc = nameMap.get(p.category);
      if (catDoc) set.categoryId = catDoc._id;
    }

    // Subcategory
    if (catDoc) {
      let subId = p.subcategoryId;
      if (!subId && typeof p.subcategory === 'string' && /^\d+$/.test(p.subcategory)) {
        subId = parseInt(p.subcategory, 10);
      }
      if (!subId && typeof p.subcategory === 'string' && p.subcategory) {
        const s = (catDoc.subcategories || []).find(x => x.name === p.subcategory);
        if (s) subId = s.id;
      }
      if (subId != null) set.subcategoryId = Number(subId);
    }

    if (Object.keys(set).length > 0) {
      await Product.updateOne({ _id: p._id }, { $set: set });
      updated++;
    }
  }

  console.log(`Migration complete. Updated ${updated} products.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

