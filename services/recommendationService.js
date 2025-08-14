const { Product, Order, User } = require('../models');
const cacheService = require('./cacheService');
const analyticsService = require('./analyticsService');

class RecommendationService {
  constructor() {
    this.algorithms = {
      collaborative: this.collaborativeFiltering.bind(this),
      contentBased: this.contentBasedFiltering.bind(this),
      popularity: this.popularityBased.bind(this),
      hybrid: this.hybridRecommendation.bind(this),
      similar: this.findSimilarProducts.bind(this),
      trending: this.getTrendingProducts.bind(this),
      seasonal: this.getSeasonalRecommendations.bind(this),
      ageBasedFiltering: this.ageBasedFiltering.bind(this)
    };
    
    this.weights = {
      collaborative: 0.3,
      contentBased: 0.25,
      popularity: 0.2,
      trending: 0.15,
      seasonal: 0.1
    };
    
    // Cache keys
    this.cacheKeys = {
      userRecommendations: (userId, algorithm) => `recommendations:user:${userId}:${algorithm}`,
      productSimilar: (productId) => `recommendations:similar:${productId}`,
      trending: 'recommendations:trending',
      popular: 'recommendations:popular',
      seasonal: (season) => `recommendations:seasonal:${season}`,
      userProfile: (userId) => `recommendations:profile:${userId}`,
      itemFeatures: (productId) => `recommendations:features:${productId}`
    };
  }
  
  /**
   * Get personalized recommendations for a user
   */
  async getRecommendations(userId, options = {}) {
    const {
      algorithm = 'hybrid',
      limit = 10,
      excludeOwned = true,
      includeOutOfStock = false,
      categories = null,
      priceRange = null,
      forceRefresh = false
    } = options;
    
    try {
      const cacheKey = `${this.cacheKeys.userRecommendations(userId, algorithm)}:${JSON.stringify(options)}`;
      
      if (!forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }
      
      let recommendations;
      
      if (this.algorithms[algorithm]) {
        recommendations = await this.algorithms[algorithm](userId, options);
      } else {
        recommendations = await this.hybridRecommendation(userId, options);
      }
      
      // Post-process recommendations
      recommendations = await this.postProcessRecommendations(
        recommendations,
        userId,
        {
          excludeOwned,
          includeOutOfStock,
          categories,
          priceRange,
          limit
        }
      );
      
      // Cache results for 1 hour
      await cacheService.set(cacheKey, recommendations, 3600);
      
      return recommendations;
    } catch (error) {
      console.error('Error getting recommendations:', error);
      // Fallback to popularity-based recommendations
      return await this.popularityBased(userId, { limit });
    }
  }
  
  /**
   * Collaborative Filtering - Based on user behavior patterns
   */
  async collaborativeFiltering(userId, options = {}) {
    try {
      const { limit = 20 } = options;
      
      // Get user's purchase history
      const userOrders = await Order.find({
        'customerInfo.userId': userId,
        status: { $in: ['delivered', 'processing'] }
      }).populate('items.productId').lean();
      
      const userProducts = new Set();
      userOrders.forEach(order => {
        order.items.forEach(item => {
          if (item.productId) {
            userProducts.add(item.productId._id.toString());
          }
        });
      });
      
      if (userProducts.size === 0) {
        // New user - fallback to popularity
        return await this.popularityBased(userId, options);
      }
      
      // Find users with similar purchase patterns
      const similarUsers = await this.findSimilarUsers(userId, userProducts);
      
      // Get products purchased by similar users
      const recommendations = new Map();
      
      for (const { userId: similarUserId, similarity } of similarUsers.slice(0, 10)) {
        const similarUserOrders = await Order.find({
          'customerInfo.userId': similarUserId,
          status: { $in: ['delivered', 'processing'] }
        }).populate('items.productId').lean();
        
        similarUserOrders.forEach(order => {
          order.items.forEach(item => {
            if (item.productId && !userProducts.has(item.productId._id.toString())) {
              const productId = item.productId._id.toString();
              const currentScore = recommendations.get(productId) || 0;
              recommendations.set(productId, currentScore + similarity * item.quantity);
            }
          });
        });
      }
      
      // Sort by score and return top products
      const sortedRecommendations = Array.from(recommendations.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit);
      
      const productIds = sortedRecommendations.map(([productId]) => productId);
      const products = await Product.find({
        _id: { $in: productIds },
        status: 'active'
      }).lean();
      
      return products.map(product => ({
        ...product,
        recommendationScore: recommendations.get(product._id.toString()),
        reason: 'Users with similar preferences also bought this'
      }));
      
    } catch (error) {
      console.error('Collaborative filtering error:', error);
      return [];
    }
  }
  
  /**
   * Content-Based Filtering - Based on product features
   */
  async contentBasedFiltering(userId, options = {}) {
    try {
      const { limit = 20 } = options;
      
      // Get user's preference profile
      const userProfile = await this.buildUserProfile(userId);
      
      if (!userProfile || Object.keys(userProfile).length === 0) {
        return await this.popularityBased(userId, options);
      }
      
      // Get all active products
      const allProducts = await Product.find({ status: 'active' }).lean();
      
      // Calculate similarity scores
      const recommendations = allProducts.map(product => {
        const features = this.extractProductFeatures(product);
        const similarity = this.calculateCosineSimilarity(userProfile, features);
        
        return {
          ...product,
          recommendationScore: similarity,
          reason: 'Based on your preferences'
        };
      });
      
      // Sort by similarity and return top products
      return recommendations
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Content-based filtering error:', error);
      return [];
    }
  }
  
  /**
   * Popularity-Based Recommendations
   */
  async popularityBased(userId, options = {}) {
    try {
      const { limit = 20, timeWindow = 30 } = options;
      
      const cacheKey = `${this.cacheKeys.popular}:${timeWindow}:${limit}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Get popular products based on sales and views
      const since = new Date();
      since.setDate(since.getDate() - timeWindow);
      
      const popularProducts = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            status: { $in: ['delivered', 'processing', 'shipped'] }
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            orderCount: { $sum: 1 },
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: {
            'product.status': 'active'
          }
        },
        {
          $addFields: {
            popularityScore: {
              $add: [
                { $multiply: ['$orderCount', 0.4] },
                { $multiply: ['$totalQuantity', 0.3] },
                { $multiply: [{ $divide: ['$totalRevenue', 100] }, 0.3] }
              ]
            }
          }
        },
        { $sort: { popularityScore: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: '$product._id',
            name: '$product.name',
            description: '$product.description',
            new_price: '$product.new_price',
            old_price: '$product.old_price',
            image: '$product.image',
            category: '$product.category',
            stock_quantity: '$product.stock_quantity',
            recommendationScore: '$popularityScore',
            reason: 'Popular choice'
          }
        }
      ]);
      
      await cacheService.set(cacheKey, popularProducts, 1800); // 30 minutes
      
      return popularProducts;
      
    } catch (error) {
      console.error('Popularity-based filtering error:', error);
      return [];
    }
  }
  
  /**
   * Hybrid Recommendation - Combines multiple algorithms
   */
  async hybridRecommendation(userId, options = {}) {
    try {
      const { limit = 20 } = options;
      
      // Get recommendations from different algorithms
      const [
        collaborativeRecs,
        contentBasedRecs,
        popularityRecs,
        trendingRecs,
        seasonalRecs
      ] = await Promise.all([
        this.collaborativeFiltering(userId, { limit: Math.ceil(limit * 1.5) }),
        this.contentBasedFiltering(userId, { limit: Math.ceil(limit * 1.5) }),
        this.popularityBased(userId, { limit: Math.ceil(limit * 1.5) }),
        this.getTrendingProducts(userId, { limit: Math.ceil(limit * 1.5) }),
        this.getSeasonalRecommendations(userId, { limit: Math.ceil(limit * 1.5) })
      ]);
      
      // Combine and weight recommendations
      const combinedScores = new Map();
      
      const addWeightedScore = (products, weight, algorithm) => {
        products.forEach(product => {
          const productId = product._id.toString();
          const currentData = combinedScores.get(productId) || {
            product,
            score: 0,
            algorithms: []
          };
          
          currentData.score += (product.recommendationScore || 1) * weight;
          currentData.algorithms.push(algorithm);
          combinedScores.set(productId, currentData);
        });
      };
      
      addWeightedScore(collaborativeRecs, this.weights.collaborative, 'collaborative');
      addWeightedScore(contentBasedRecs, this.weights.contentBased, 'content-based');
      addWeightedScore(popularityRecs, this.weights.popularity, 'popularity');
      addWeightedScore(trendingRecs, this.weights.trending, 'trending');
      addWeightedScore(seasonalRecs, this.weights.seasonal, 'seasonal');
      
      // Sort by combined score
      const sortedRecommendations = Array.from(combinedScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      return sortedRecommendations.map(({ product, score, algorithms }) => ({
        ...product,
        recommendationScore: score,
        reason: `Recommended based on ${algorithms.join(', ')} analysis`,
        algorithms
      }));
      
    } catch (error) {
      console.error('Hybrid recommendation error:', error);
      return await this.popularityBased(userId, options);
    }
  }
  
  /**
   * Find Similar Products
   */
  async findSimilarProducts(productId, options = {}) {
    try {
      const { limit = 10, algorithm = 'content' } = options;
      
      const cacheKey = this.cacheKeys.productSimilar(productId);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached.slice(0, limit);
      }
      
      const targetProduct = await Product.findById(productId).lean();
      if (!targetProduct) {
        return [];
      }
      
      const targetFeatures = this.extractProductFeatures(targetProduct);
      
      // Find products in the same or related categories
      const relatedProducts = await Product.find({
        _id: { $ne: productId },
        status: 'active',
        $or: [
          { category: targetProduct.category },
          { age_range: targetProduct.age_range },
          { gender: targetProduct.gender }
        ]
      }).lean();
      
      // Calculate similarity scores
      const similarities = relatedProducts.map(product => {
        const productFeatures = this.extractProductFeatures(product);
        const similarity = this.calculateCosineSimilarity(targetFeatures, productFeatures);
        
        return {
          ...product,
          similarityScore: similarity,
          reason: 'Similar to this product'
        };
      });
      
      // Sort by similarity
      const sortedSimilarities = similarities
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 50); // Get top 50 for caching
      
      await cacheService.set(cacheKey, sortedSimilarities, 3600);
      
      return sortedSimilarities.slice(0, limit);
      
    } catch (error) {
      console.error('Similar products error:', error);
      return [];
    }
  }
  
  /**
   * Get Trending Products
   */
  async getTrendingProducts(userId, options = {}) {
    try {
      const { limit = 20, timeWindow = 7 } = options;
      
      const cacheKey = `${this.cacheKeys.trending}:${timeWindow}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached.slice(0, limit);
      }
      
      const since = new Date();
      since.setDate(since.getDate() - timeWindow);
      
      // Get trending based on recent order velocity
      const trending = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            status: { $in: ['delivered', 'processing', 'shipped'] }
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              productId: '$items.productId',
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            },
            dailyOrders: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.productId',
            averageDailyOrders: { $avg: '$dailyOrders' },
            peakDailyOrders: { $max: '$dailyOrders' },
            totalOrders: { $sum: '$dailyOrders' }
          }
        },
        {
          $addFields: {
            trendScore: {
              $multiply: [
                '$averageDailyOrders',
                { $divide: ['$peakDailyOrders', '$averageDailyOrders'] }
              ]
            }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: {
            'product.status': 'active'
          }
        },
        { $sort: { trendScore: -1 } },
        { $limit: 50 },
        {
          $project: {
            _id: '$product._id',
            name: '$product.name',
            description: '$product.description',
            new_price: '$product.new_price',
            old_price: '$product.old_price',
            image: '$product.image',
            category: '$product.category',
            stock_quantity: '$product.stock_quantity',
            recommendationScore: '$trendScore',
            reason: 'Trending now'
          }
        }
      ]);
      
      await cacheService.set(cacheKey, trending, 1800);
      
      return trending.slice(0, limit);
      
    } catch (error) {
      console.error('Trending products error:', error);
      return [];
    }
  }
  
  /**
   * Get Seasonal Recommendations
   */
  async getSeasonalRecommendations(userId, options = {}) {
    try {
      const { limit = 20, season } = options;
      const currentSeason = season || this.getCurrentSeason();
      
      const cacheKey = this.cacheKeys.seasonal(currentSeason);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached.slice(0, limit);
      }
      
      // Define seasonal keywords and categories
      const seasonalMapping = {
        spring: ['spring', 'light', 'outdoor', 'casual', 't-shirt', 'shorts'],
        summer: ['summer', 'beach', 'swimwear', 'shorts', 'sandals', 'hat'],
        autumn: ['autumn', 'fall', 'jacket', 'long-sleeve', 'boots', 'warm'],
        winter: ['winter', 'coat', 'sweater', 'boots', 'warm', 'holiday']
      };
      
      const keywords = seasonalMapping[currentSeason] || [];
      
      const seasonalProducts = await Product.find({
        status: 'active',
        $or: [
          { name: { $in: keywords.map(k => new RegExp(k, 'i')) } },
          { description: { $in: keywords.map(k => new RegExp(k, 'i')) } },
          { tags: { $in: keywords } }
        ]
      }).lean();
      
      const recommendations = seasonalProducts
        .map(product => ({
          ...product,
          recommendationScore: Math.random() * 0.5 + 0.5, // Random score between 0.5 and 1
          reason: `Perfect for ${currentSeason}`
        }))
        .sort((a, b) => b.recommendationScore - a.recommendationScore);
      
      await cacheService.set(cacheKey, recommendations, 86400); // 24 hours
      
      return recommendations.slice(0, limit);
      
    } catch (error) {
      console.error('Seasonal recommendations error:', error);
      return [];
    }
  }
  
  /**
   * Age-Based Filtering
   */
  async ageBasedFiltering(userId, options = {}) {
    try {
      const { limit = 20, childAge } = options;
      
      // If no age provided, try to infer from user's order history
      let targetAge = childAge;
      if (!targetAge) {
        targetAge = await this.inferChildAgeFromHistory(userId);
      }
      
      if (!targetAge) {
        return await this.popularityBased(userId, options);
      }
      
      // Define age range mappings
      const ageRanges = {
        '0-6months': [0, 0.5],
        '6-12months': [0.5, 1],
        '1-2years': [1, 2],
        '2-3years': [2, 3],
        '3-4years': [3, 4],
        '4-6years': [4, 6],
        '6-8years': [6, 8],
        '8-10years': [8, 10],
        '10-12years': [10, 12],
        '12-14years': [12, 14]
      };
      
      // Find appropriate age range
      let targetRange = null;
      for (const [range, [min, max]] of Object.entries(ageRanges)) {
        if (targetAge >= min && targetAge <= max) {
          targetRange = range;
          break;
        }
      }
      
      if (!targetRange) {
        return await this.popularityBased(userId, options);
      }
      
      // Get products for the age range
      const ageAppropriateProducts = await Product.find({
        status: 'active',
        age_range: targetRange
      }).lean();
      
      return ageAppropriateProducts
        .map(product => ({
          ...product,
          recommendationScore: Math.random() * 0.3 + 0.7,
          reason: `Age-appropriate for ${targetAge} years old`
        }))
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Age-based filtering error:', error);
      return [];
    }
  }
  
  /**
   * Helper Methods
   */
  
  async findSimilarUsers(userId, userProducts) {
    try {
      // Get other users' purchase patterns
      const otherUsers = await Order.aggregate([
        {
          $match: {
            'customerInfo.userId': { $ne: userId },
            status: { $in: ['delivered', 'processing'] }
          }
        },
        {
          $group: {
            _id: '$customerInfo.userId',
            products: { $addToSet: '$items.productId' }
          }
        }
      ]);
      
      const similarities = otherUsers.map(user => {
        const otherUserProducts = new Set(user.products.map(id => id.toString()));
        const similarity = this.calculateJaccardSimilarity(userProducts, otherUserProducts);
        
        return {
          userId: user._id,
          similarity
        };
      });
      
      return similarities
        .filter(s => s.similarity > 0.1)
        .sort((a, b) => b.similarity - a.similarity);
        
    } catch (error) {
      console.error('Error finding similar users:', error);
      return [];
    }
  }
  
  async buildUserProfile(userId) {
    try {
      const cacheKey = this.cacheKeys.userProfile(userId);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      const userOrders = await Order.find({
        'customerInfo.userId': userId,
        status: { $in: ['delivered', 'processing'] }
      }).populate('items.productId').lean();
      
      const profile = {};
      
      userOrders.forEach(order => {
        order.items.forEach(item => {
          if (item.productId) {
            const features = this.extractProductFeatures(item.productId);
            Object.keys(features).forEach(feature => {
              profile[feature] = (profile[feature] || 0) + features[feature] * item.quantity;
            });
          }
        });
      });
      
      // Normalize profile
      const totalWeight = Object.values(profile).reduce((sum, weight) => sum + weight, 0);
      if (totalWeight > 0) {
        Object.keys(profile).forEach(feature => {
          profile[feature] /= totalWeight;
        });
      }
      
      await cacheService.set(cacheKey, profile, 3600);
      
      return profile;
      
    } catch (error) {
      console.error('Error building user profile:', error);
      return {};
    }
  }
  
  extractProductFeatures(product) {
    const features = {};
    
    // Category features
    if (product.category) {
      features[`category_${product.category}`] = 1;
    }
    
    // Price range features
    const price = product.new_price || 0;
    if (price < 20) features.price_low = 1;
    else if (price < 50) features.price_medium = 1;
    else features.price_high = 1;
    
    // Age range features
    if (product.age_range) {
      features[`age_${product.age_range}`] = 1;
    }
    
    // Gender features
    if (product.gender) {
      features[`gender_${product.gender}`] = 1;
    }
    
    // Brand features
    if (product.brand) {
      features[`brand_${product.brand}`] = 1;
    }
    
    return features;
  }
  
  calculateCosineSimilarity(vectorA, vectorB) {
    const keys = new Set([...Object.keys(vectorA), ...Object.keys(vectorB)]);
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (const key of keys) {
      const valueA = vectorA[key] || 0;
      const valueB = vectorB[key] || 0;
      
      dotProduct += valueA * valueB;
      magnitudeA += valueA * valueA;
      magnitudeB += valueB * valueB;
    }
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }
  
  calculateJaccardSimilarity(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
  
  getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }
  
  async inferChildAgeFromHistory(userId) {
    try {
      const userOrders = await Order.find({
        'customerInfo.userId': userId,
        status: { $in: ['delivered', 'processing'] }
      }).populate('items.productId').lean();
      
      const ageCounts = {};
      
      userOrders.forEach(order => {
        order.items.forEach(item => {
          if (item.productId && item.productId.age_range) {
            const ageRange = item.productId.age_range;
            ageCounts[ageRange] = (ageCounts[ageRange] || 0) + item.quantity;
          }
        });
      });
      
      if (Object.keys(ageCounts).length === 0) {
        return null;
      }
      
      // Get most common age range and return middle value
      const mostCommonRange = Object.keys(ageCounts)
        .reduce((a, b) => ageCounts[a] > ageCounts[b] ? a : b);
      
      const ageMapping = {
        '0-6months': 0.25,
        '6-12months': 0.75,
        '1-2years': 1.5,
        '2-3years': 2.5,
        '3-4years': 3.5,
        '4-6years': 5,
        '6-8years': 7,
        '8-10years': 9,
        '10-12years': 11,
        '12-14years': 13
      };
      
      return ageMapping[mostCommonRange] || null;
      
    } catch (error) {
      console.error('Error inferring child age:', error);
      return null;
    }
  }
  
  async postProcessRecommendations(recommendations, userId, filters) {
    try {
      let filtered = recommendations;
      
      // Remove out of stock if requested
      if (!filters.includeOutOfStock) {
        filtered = filtered.filter(product => product.stock_quantity > 0);
      }
      
      // Filter by categories
      if (filters.categories && filters.categories.length > 0) {
        filtered = filtered.filter(product => 
          filters.categories.includes(product.category)
        );
      }
      
      // Filter by price range
      if (filters.priceRange) {
        const { min, max } = filters.priceRange;
        filtered = filtered.filter(product => {
          const price = product.new_price || 0;
          return price >= min && price <= max;
        });
      }
      
      // Remove products user has already purchased if requested
      if (filters.excludeOwned) {
        const userProducts = await this.getUserPurchasedProducts(userId);
        filtered = filtered.filter(product => 
          !userProducts.has(product._id.toString())
        );
      }
      
      // Apply limit
      if (filters.limit) {
        filtered = filtered.slice(0, filters.limit);
      }
      
      return filtered;
      
    } catch (error) {
      console.error('Error post-processing recommendations:', error);
      return recommendations;
    }
  }
  
  async getUserPurchasedProducts(userId) {
    try {
      const userOrders = await Order.find({
        'customerInfo.userId': userId,
        status: { $in: ['delivered', 'processing'] }
      }).lean();
      
      const purchasedProducts = new Set();
      userOrders.forEach(order => {
        order.items.forEach(item => {
          if (item.productId) {
            purchasedProducts.add(item.productId.toString());
          }
        });
      });
      
      return purchasedProducts;
      
    } catch (error) {
      console.error('Error getting user purchased products:', error);
      return new Set();
    }
  }
  
  /**
   * Clear recommendation caches for a user
   */
  async clearUserCache(userId) {
    try {
      const patterns = [
        `recommendations:user:${userId}:*`,
        this.cacheKeys.userProfile(userId)
      ];
      
      for (const pattern of patterns) {
        await cacheService.deletePattern(pattern);
      }
      
    } catch (error) {
      console.error('Error clearing user recommendation cache:', error);
    }
  }
  
  /**
   * Update recommendations after user action
   */
  async updateRecommendations(userId, action, data = {}) {
    try {
      // Clear user-specific caches
      await this.clearUserCache(userId);
      
      // Update global caches if needed
      if (action === 'purchase') {
        await cacheService.delete(this.cacheKeys.trending);
        await cacheService.delete(this.cacheKeys.popular);
      }
      
    } catch (error) {
      console.error('Error updating recommendations:', error);
    }
  }
}

module.exports = new RecommendationService();
