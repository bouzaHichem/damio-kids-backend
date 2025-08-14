// Models index file - centralized model exports

const User = require('./User');
const Product = require('./Product');
const Order = require('./Order');
const Category = require('./Category');
const { Wilaya, DeliveryFee } = require('./Location');
const { ShopImage, Collection } = require('./Media');

module.exports = {
  // User management
  User,
  
  // Product management
  Product,
  
  // Order management
  Order,
  
  // Category management
  Category,
  
  // Location and delivery
  Wilaya,
  DeliveryFee,
  
  // Media and content
  ShopImage,
  Collection
};
