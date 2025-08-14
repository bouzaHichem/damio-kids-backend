const { Product, Category } = require('../models');

class SearchService {
  
  /**
   * Perform advanced product search with full-text search and filters
   * @param {Object} params - Search parameters
   */
  static async searchProducts(params = {}) {
    const {
      q, // search query
      category,
      brand,
      minPrice,
      maxPrice,
      sizes,
      colors,
      tags,
      ageRange,
      status = 'active',
      available = true,
      sortBy = 'relevance',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      includeOutOfStock = false
    } = params;
    
    // Build the base query
    let query = await this.buildSearchQuery({
      q,
      category,
      brand,
      minPrice,
      maxPrice,
      sizes,
      colors,
      tags,
      ageRange,
      status,
      available,
      includeOutOfStock
    });
    
    // Build sort criteria
    const sortCriteria = this.buildSortCriteria(sortBy, sortOrder, q);
    
    // Execute search with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const pageSize = parseInt(limit);
    
    const [products, totalCount, filters] = await Promise.all([
      Product.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(pageSize)
        .populate('category', 'name')
        .lean(),
      Product.countDocuments(query),
      this.getAvailableFilters(q) // Get available filters for faceted search
    ]);
    
    // Enhance products with additional data
    const enhancedProducts = await this.enhanceProductResults(products, q);
    
    return {
      products: enhancedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / pageSize),
        totalProducts: totalCount,
        hasNextPage: skip + products.length < totalCount,
        hasPrevPage: parseInt(page) > 1,
        limit: pageSize
      },
      filters,
      searchMetadata: {
        query: q,
        resultsFound: totalCount,
        searchTime: Date.now(),
        suggestions: q ? await this.generateSearchSuggestions(q, totalCount) : []
      }
    };
  }
  
  /**
   * Build MongoDB query from search parameters
   * @param {Object} params - Search parameters
   */
  static async buildSearchQuery(params) {
    const {
      q,
      category,
      brand,
      minPrice,
      maxPrice,
      sizes,
      colors,
      tags,
      ageRange,
      status,
      available,
      includeOutOfStock
    } = params;
    
    let query = {};
    
    // Text search
    if (q && q.trim()) {
      const searchTerms = q.trim().split(/\s+/);
      const searchRegex = new RegExp(searchTerms.join('|'), 'i');
      
      query.$or = [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { brand: { $regex: searchRegex } },
        { tags: { $in: searchTerms.map(term => new RegExp(term, 'i')) } },
        { category: { $regex: searchRegex } },
        { material: { $regex: searchRegex } },
        { sku: { $regex: searchRegex } }
      ];
    }
    
    // Category filter
    if (category && category !== 'all') {
      query.category = new RegExp(category, 'i');
    }
    
    // Brand filter
    if (brand && brand !== 'all') {
      query.brand = new RegExp(brand, 'i');
    }
    
    // Price range filter
    if (minPrice || maxPrice) {
      query.new_price = {};
      if (minPrice) query.new_price.$gte = parseFloat(minPrice);
      if (maxPrice) query.new_price.$lte = parseFloat(maxPrice);
    }
    
    // Size filter
    if (sizes && sizes.length > 0) {
      const sizeArray = Array.isArray(sizes) ? sizes : sizes.split(',');
      query.sizes = { $in: sizeArray };
    }
    
    // Color filter
    if (colors && colors.length > 0) {
      const colorArray = Array.isArray(colors) ? colors : colors.split(',');
      query.colors = { $in: colorArray.map(color => new RegExp(color, 'i')) };
    }
    
    // Tags filter
    if (tags && tags.length > 0) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      query.tags = { $in: tagArray.map(tag => new RegExp(tag, 'i')) };
    }
    
    // Age range filter
    if (ageRange) {
      if (ageRange.min !== undefined || ageRange.max !== undefined) {\n        query.$and = query.$and || [];\n        \n        if (ageRange.min !== undefined) {\n          query.$and.push({\n            $or: [\n              { 'ageRange.max': { $gte: parseInt(ageRange.min) } },\n              { 'ageRange.max': { $exists: false } }\n            ]\n          });\n        }\n        \n        if (ageRange.max !== undefined) {\n          query.$and.push({\n            $or: [\n              { 'ageRange.min': { $lte: parseInt(ageRange.max) } },\n              { 'ageRange.min': { $exists: false } }\n            ]\n          });\n        }\n      }\n    }
    
    // Status filter
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }
    
    // Availability filter
    if (available && !includeOutOfStock) {
      query.avilable = true;
      query.stock_quantity = { $gt: 0 };
    } else if (includeOutOfStock === false) {
      query.avilable = true;
    }
    
    return query;
  }
  
  /**
   * Build sort criteria based on sort parameters
   * @param {string} sortBy - Sort field
   * @param {string} sortOrder - Sort order
   * @param {string} searchQuery - Search query for relevance
   */
  static buildSortCriteria(sortBy, sortOrder, searchQuery) {
    const order = sortOrder === 'asc' ? 1 : -1;
    let sortCriteria = {};
    
    switch (sortBy) {
      case 'price':
        sortCriteria.new_price = order;
        break;
      case 'name':
        sortCriteria.name = order;
        break;
      case 'date':
      case 'newest':
        sortCriteria.date = -1; // Always newest first
        break;
      case 'popular':
        sortCriteria.popular = -1;
        sortCriteria.date = -1;
        break;
      case 'rating':
        // sortCriteria.averageRating = order; // If you have ratings
        sortCriteria.popular = -1;
        break;
      case 'stock':
        sortCriteria.stock_quantity = order;
        break;
      case 'relevance':
      default:
        if (searchQuery) {
          // For text search, sort by relevance (text search score)
          sortCriteria.score = { $meta: 'textScore' };
        }
        // Add secondary sort by popularity and date
        sortCriteria.featured = -1;
        sortCriteria.popular = -1;
        sortCriteria.date = -1;
        break;
    }
    
    return sortCriteria;
  }
  
  /**
   * Get available filters for faceted search
   * @param {string} searchQuery - Current search query
   */
  static async getAvailableFilters(searchQuery = '') {
    // Build base query for filter aggregation
    let baseQuery = { status: 'active' };
    
    if (searchQuery) {
      const searchTerms = searchQuery.trim().split(/\s+/);
      const searchRegex = new RegExp(searchTerms.join('|'), 'i');
      baseQuery.$or = [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { brand: { $regex: searchRegex } },
        { tags: { $in: searchTerms.map(term => new RegExp(term, 'i')) } }
      ];
    }
    
    const [
      categories,
      brands,
      priceRange,
      sizes,
      colors,
      tags
    ] = await Promise.all([
      // Categories with product counts
      Product.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      
      // Brands with product counts
      Product.aggregate([
        { $match: { ...baseQuery, brand: { $ne: null, $ne: '' } } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ]),
      
      // Price range
      Product.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            minPrice: { $min: '$new_price' },
            maxPrice: { $max: '$new_price' },
            avgPrice: { $avg: '$new_price' }
          }
        }
      ]),
      
      // Available sizes
      Product.aggregate([
        { $match: baseQuery },
        { $unwind: '$sizes' },
        { $group: { _id: '$sizes', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Available colors
      Product.aggregate([
        { $match: baseQuery },
        { $unwind: '$colors' },
        { $group: { _id: '$colors', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      
      // Popular tags
      Product.aggregate([
        { $match: baseQuery },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ])
    ]);
    
    return {
      categories: categories.map(item => ({
        name: item._id,
        count: item.count
      })),
      brands: brands.map(item => ({
        name: item._id,
        count: item.count
      })),
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
      sizes: sizes.map(item => ({
        name: item._id,
        count: item.count
      })),
      colors: colors.map(item => ({
        name: item._id,
        count: item.count
      })),
      tags: tags.map(item => ({
        name: item._id,
        count: item.count
      }))
    };
  }
  
  /**
   * Enhance product results with additional data
   * @param {Array} products - Product results
   * @param {string} searchQuery - Search query
   */
  static async enhanceProductResults(products, searchQuery = '') {
    return products.map(product => {
      // Calculate relevance score if search query exists
      let relevanceScore = 0;
      if (searchQuery) {
        relevanceScore = this.calculateRelevanceScore(product, searchQuery);
      }
      
      return {
        ...product,
        relevanceScore,
        // Add virtual fields
        discountPercentage: product.old_price && product.old_price > product.new_price 
          ? Math.round(((product.old_price - product.new_price) / product.old_price) * 100)
          : 0,
        isAvailable: product.status === 'active' && product.avilable && product.stock_quantity > 0,
        stockStatus: this.getStockStatus(product.stock_quantity),
        priceDisplay: {
          current: product.new_price,
          original: product.old_price,
          currency: 'DZD',
          hasDiscount: product.old_price && product.old_price > product.new_price
        }
      };
    });
  }
  
  /**
   * Calculate relevance score for search results
   * @param {Object} product - Product object
   * @param {string} query - Search query
   */
  static calculateRelevanceScore(product, query) {
    if (!query) return 0;
    
    const searchTerms = query.toLowerCase().split(/\s+/);
    let score = 0;
    
    searchTerms.forEach(term => {
      // Name matches (highest weight)
      if (product.name && product.name.toLowerCase().includes(term)) {
        score += product.name.toLowerCase().indexOf(term) === 0 ? 10 : 5; // Bonus for start of name
      }
      
      // Brand matches
      if (product.brand && product.brand.toLowerCase().includes(term)) {
        score += 3;
      }
      
      // Category matches
      if (product.category && product.category.toLowerCase().includes(term)) {
        score += 2;
      }
      
      // Description matches
      if (product.description && product.description.toLowerCase().includes(term)) {
        score += 1;
      }
      
      // Tag matches
      if (product.tags && product.tags.some(tag => tag.toLowerCase().includes(term))) {
        score += 2;
      }
      
      // Material matches
      if (product.material && product.material.toLowerCase().includes(term)) {
        score += 1;
      }
    });
    
    // Boost popular and featured items
    if (product.featured) score += 2;
    if (product.popular) score += 1;
    
    return score;
  }
  
  /**
   * Get stock status string
   * @param {number} quantity - Stock quantity
   */
  static getStockStatus(quantity) {
    if (quantity <= 0) return 'out_of_stock';
    if (quantity <= 5) return 'low_stock';
    if (quantity <= 10) return 'limited_stock';
    return 'in_stock';
  }
  
  /**
   * Generate search suggestions based on query and results
   * @param {string} query - Search query
   * @param {number} resultCount - Number of results found
   */
  static async generateSearchSuggestions(query, resultCount) {
    const suggestions = [];
    
    if (resultCount === 0 || resultCount < 5) {
      // Suggest similar products or categories
      const similarProducts = await this.findSimilarTerms(query);
      suggestions.push(...similarProducts);
      
      // Suggest popular categories
      const popularCategories = await this.getPopularCategories(3);
      suggestions.push(...popularCategories.map(cat => `${cat.name} products`));
    }
    
    // Suggest query refinements
    if (resultCount > 50) {
      suggestions.push(`${query} on sale`);
      suggestions.push(`${query} new arrivals`);
      suggestions.push(`${query} popular`);
    }
    
    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }
  
  /**
   * Find similar terms using fuzzy matching
   * @param {string} query - Search query
   */
  static async findSimilarTerms(query) {
    // Simple implementation - in production, you might use more sophisticated fuzzy matching
    const queryWords = query.toLowerCase().split(/\s+/);
    const suggestions = [];
    
    for (const word of queryWords) {
      // Find products with similar names
      const similarProducts = await Product.find({
        name: new RegExp(word.substr(0, 3), 'i'), // Match first 3 characters
        status: 'active'
      })
      .select('name')
      .limit(3)
      .lean();
      
      suggestions.push(...similarProducts.map(p => p.name));
    }
    
    return [...new Set(suggestions)]; // Remove duplicates
  }
  
  /**
   * Get popular categories for suggestions
   * @param {number} limit - Number of categories to return
   */
  static async getPopularCategories(limit = 5) {
    return await Product.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { name: '$_id', count: 1 } }
    ]);
  }
  
  /**
   * Get search autocomplete suggestions
   * @param {string} query - Partial query
   * @param {number} limit - Number of suggestions
   */
  static async getAutocompleteSuggestions(query, limit = 10) {
    if (!query || query.length < 2) return [];
    
    const regex = new RegExp(`^${query}`, 'i');
    
    const [productNames, brands, categories] = await Promise.all([
      // Product names
      Product.find({
        name: regex,
        status: 'active'
      })
      .select('name')
      .limit(5)
      .lean(),
      
      // Brands
      Product.distinct('brand', {
        brand: regex,
        status: 'active'
      }).limit(3),
      
      // Categories
      Product.distinct('category', {
        category: regex,
        status: 'active'
      }).limit(3)
    ]);
    
    const suggestions = [
      ...productNames.map(p => ({ text: p.name, type: 'product' })),
      ...brands.map(b => ({ text: b, type: 'brand' })),
      ...categories.map(c => ({ text: c, type: 'category' }))
    ];
    
    return suggestions.slice(0, limit);
  }
  
  /**
   * Get trending searches (mock implementation)
   */
  static async getTrendingSearches(limit = 10) {
    // In production, you would track actual search queries and their frequency
    const trending = [
      'winter collection',
      'new arrivals',
      'baby clothes',
      'discount items',
      'popular brands',
      'seasonal sale',
      'boys outfits',
      'girls dresses',
      'comfortable wear',
      'premium quality'
    ];
    
    return trending.slice(0, limit).map(term => ({
      query: term,
      type: 'trending'
    }));
  }
  
  /**
   * Get recently searched terms for a user (mock implementation)
   * @param {string} userId - User ID
   */
  static async getRecentSearches(userId, limit = 5) {
    // In production, you would store and retrieve actual user search history
    return [];
  }
  
  /**
   * Log search query for analytics (mock implementation)
   * @param {string} query - Search query
   * @param {number} resultCount - Number of results
   * @param {string} userId - User ID (optional)
   */
  static async logSearch(query, resultCount, userId = null) {
    // In production, you would store search analytics
    console.log(`Search logged: "${query}" (${resultCount} results) by ${userId || 'anonymous'}`);
  }
}

module.exports = SearchService;
