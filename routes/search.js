const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const SearchService = require('../services/searchService');
const { queryValidation } = require('../middleware/validation');

/**
 * Advanced Search Routes
 */

// Advanced product search with filters
router.get('/', queryValidation.productSearch, asyncHandler(async (req, res) => {
  const searchParams = {
    q: req.query.q,
    category: req.query.category,
    brand: req.query.brand,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    sizes: req.query.sizes,
    colors: req.query.colors,
    tags: req.query.tags,
    ageRange: {
      min: req.query.ageMin ? parseInt(req.query.ageMin) : undefined,
      max: req.query.ageMax ? parseInt(req.query.ageMax) : undefined
    },
    status: req.query.status,
    available: req.query.available !== 'false',
    sortBy: req.query.sortBy,
    sortOrder: req.query.sortOrder,
    page: req.query.page,
    limit: req.query.limit,
    includeOutOfStock: req.query.includeOutOfStock === 'true'
  };
  
  const results = await SearchService.searchProducts(searchParams);
  
  // Log search for analytics
  if (searchParams.q) {
    await SearchService.logSearch(
      searchParams.q,
      results.pagination.totalProducts,
      req.user?.id
    );
  }
  
  res.json({
    success: true,
    data: results
  });
}));

// Get search autocomplete suggestions
router.get('/autocomplete', asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  
  if (!q || q.length < 2) {
    return res.json({
      success: true,
      data: {
        suggestions: [],
        message: 'Query must be at least 2 characters'
      }
    });
  }
  
  const suggestions = await SearchService.getAutocompleteSuggestions(q, parseInt(limit));
  
  res.json({
    success: true,
    data: {
      suggestions,
      query: q
    }
  });
}));

// Get trending searches
router.get('/trending', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  
  const trending = await SearchService.getTrendingSearches(parseInt(limit));
  
  res.json({
    success: true,
    data: {
      trending,
      timestamp: new Date().toISOString()
    }
  });
}));

// Get recent searches for user (if authenticated)
router.get('/recent', asyncHandler(async (req, res) => {
  const { limit = 5 } = req.query;
  
  if (!req.user) {
    return res.json({
      success: true,
      data: {
        recent: [],
        message: 'Authentication required for recent searches'
      }
    });
  }
  
  const recent = await SearchService.getRecentSearches(req.user.id, parseInt(limit));
  
  res.json({
    success: true,
    data: {
      recent,
      userId: req.user.id
    }
  });
}));

// Get search filters (faceted search data)
router.get('/filters', asyncHandler(async (req, res) => {
  const { q } = req.query;
  
  const filters = await SearchService.getAvailableFilters(q);
  
  res.json({
    success: true,
    data: {
      filters,
      query: q || null
    }
  });
}));

// Search suggestions based on query and results
router.get('/suggestions', asyncHandler(async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter is required'
    });
  }
  
  // First, get the search results count
  const searchResults = await SearchService.searchProducts({ q, limit: 1 });
  const suggestions = await SearchService.generateSearchSuggestions(q, searchResults.pagination.totalProducts);
  
  res.json({
    success: true,
    data: {
      suggestions,
      query: q,
      resultsFound: searchResults.pagination.totalProducts
    }
  });
}));

/**
 * Category-based Search Routes
 */

// Search within a specific category
router.get('/category/:categoryName', queryValidation.productSearch, asyncHandler(async (req, res) => {
  const { categoryName } = req.params;
  
  const searchParams = {
    category: categoryName,
    q: req.query.q,
    brand: req.query.brand,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    sizes: req.query.sizes,
    colors: req.query.colors,
    tags: req.query.tags,
    sortBy: req.query.sortBy || 'popular',
    sortOrder: req.query.sortOrder,
    page: req.query.page,
    limit: req.query.limit
  };
  
  const results = await SearchService.searchProducts(searchParams);
  
  res.json({
    success: true,
    data: {
      ...results,
      categoryName,
      searchWithinCategory: true
    }
  });
}));

// Search by brand
router.get('/brand/:brandName', queryValidation.productSearch, asyncHandler(async (req, res) => {
  const { brandName } = req.params;
  
  const searchParams = {
    brand: brandName,
    q: req.query.q,
    category: req.query.category,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    sizes: req.query.sizes,
    colors: req.query.colors,
    tags: req.query.tags,
    sortBy: req.query.sortBy || 'popular',
    sortOrder: req.query.sortOrder,
    page: req.query.page,
    limit: req.query.limit
  };
  
  const results = await SearchService.searchProducts(searchParams);
  
  res.json({
    success: true,
    data: {
      ...results,
      brandName,
      searchWithinBrand: true
    }
  });
}));

/**
 * Special Search Routes
 */

// Search sale/discounted products
router.get('/sale', queryValidation.productSearch, asyncHandler(async (req, res) => {
  const { Product } = require('../models');
  
  // Find products with discounts
  const saleQuery = {
    status: 'active',
    avilable: true,
    $expr: {
      $and: [
        { $ne: ['$old_price', null] },
        { $gt: ['$old_price', '$new_price'] }
      ]
    }
  };
  
  // Add additional filters if provided
  if (req.query.category) {
    saleQuery.category = new RegExp(req.query.category, 'i');
  }
  
  if (req.query.minPrice || req.query.maxPrice) {
    saleQuery.new_price = {};
    if (req.query.minPrice) saleQuery.new_price.$gte = parseFloat(req.query.minPrice);
    if (req.query.maxPrice) saleQuery.new_price.$lte = parseFloat(req.query.maxPrice);
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const [products, totalCount] = await Promise.all([
    Product.find(saleQuery)
      .sort({ 
        $expr: { $subtract: ['$old_price', '$new_price'] }: -1, // Sort by discount amount
        date: -1 
      })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(saleQuery)
  ]);
  
  // Add discount information
  const enhancedProducts = products.map(product => ({
    ...product,
    discountPercentage: Math.round(((product.old_price - product.new_price) / product.old_price) * 100),
    discountAmount: product.old_price - product.new_price,
    isOnSale: true
  }));
  
  res.json({
    success: true,
    data: {
      products: enhancedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalProducts: totalCount,
        hasNextPage: skip + products.length < totalCount,
        hasPrevPage: page > 1,
        limit
      },
      searchMetadata: {
        searchType: 'sale',
        resultsFound: totalCount
      }
    }
  });
}));

// Search new arrivals
router.get('/new-arrivals', queryValidation.productSearch, asyncHandler(async (req, res) => {
  const daysBack = parseInt(req.query.days) || 30;
  const dateThreshold = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  
  const searchParams = {
    q: req.query.q,
    category: req.query.category,
    brand: req.query.brand,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    sortBy: 'newest',
    sortOrder: 'desc',
    page: req.query.page,
    limit: req.query.limit
  };
  
  // Add date filter to search
  const results = await SearchService.searchProducts(searchParams);
  
  // Filter results to only include new arrivals
  results.products = results.products.filter(product => 
    new Date(product.date) >= dateThreshold
  );
  
  results.pagination.totalProducts = results.products.length;
  results.searchMetadata.searchType = 'new-arrivals';
  results.searchMetadata.daysBack = daysBack;
  
  res.json({
    success: true,
    data: results
  });
}));

// Search popular products
router.get('/popular', queryValidation.productSearch, asyncHandler(async (req, res) => {
  const searchParams = {
    q: req.query.q,
    category: req.query.category,
    brand: req.query.brand,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    sortBy: 'popular',
    sortOrder: 'desc',
    page: req.query.page,
    limit: req.query.limit
  };
  
  const results = await SearchService.searchProducts(searchParams);
  
  // Filter to only popular products or products with high ratings
  const { Product } = require('../models');
  const popularProducts = await Product.find({
    $or: [
      { popular: true },
      { featured: true },
      // Add other popularity criteria
    ],
    status: 'active',
    avilable: true
  })
  .sort({ popular: -1, featured: -1, date: -1 })
  .limit(parseInt(req.query.limit) || 20)
  .lean();
  
  results.products = popularProducts;
  results.searchMetadata.searchType = 'popular';
  
  res.json({
    success: true,
    data: results
  });
}));

/**
 * Search Analytics Routes (for admin)
 */

// Get search analytics (admin only)
router.get('/analytics', asyncHandler(async (req, res) => {
  // This would require admin authentication
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  
  // Mock analytics data - in production, this would come from actual search logs
  const analytics = {
    topSearches: [
      { query: 'baby clothes', count: 450, resultsFound: 120 },
      { query: 'winter collection', count: 340, resultsFound: 85 },
      { query: 'new arrivals', count: 280, resultsFound: 95 },
      { query: 'discount items', count: 220, resultsFound: 67 },
      { query: 'boys outfits', count: 180, resultsFound: 45 }
    ],
    noResultsSearches: [
      { query: 'summer hats', count: 25 },
      { query: 'swimming gear', count: 18 },
      { query: 'formal shoes', count: 12 }
    ],
    searchTrends: {
      thisWeek: 1250,
      lastWeek: 980,
      growth: '+27.6%'
    },
    averageResultsPerSearch: 23.5,
    searchConversionRate: '12.3%'
  };
  
  res.json({
    success: true,
    data: analytics
  });
}));

module.exports = router;
