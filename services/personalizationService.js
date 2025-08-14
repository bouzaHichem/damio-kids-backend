const { User, Product, Order } = require('../models');
const cacheService = require('./cacheService');
const recommendationService = require('./recommendationService');

class PersonalizationService {
  constructor() {
    this.userProfiles = new Map();
    this.behaviorWeights = {
      view: 1,
      addToCart: 3,
      purchase: 10,
      like: 2,
      share: 4,
      search: 1.5
    };
    
    this.decayFactor = 0.1; // How quickly interests decay over time
    this.maxInterestScore = 100;
    
    // Cache keys
    this.cacheKeys = {
      userProfile: (userId) => `personalization:profile:${userId}`,
      userBehavior: (userId) => `personalization:behavior:${userId}`,
      userPreferences: (userId) => `personalization:preferences:${userId}`,
      personalizedContent: (userId, type) => `personalization:content:${userId}:${type}`,
      userSegment: (userId) => `personalization:segment:${userId}`
    };
  }
  
  /**
   * Track user behavior for personalization
   */
  async trackBehavior(userId, behavior) {
    try {
      const {
        action,
        productId = null,
        category = null,
        searchQuery = null,
        sessionId = null,
        timestamp = new Date(),
        metadata = {}
      } = behavior;
      
      // Get current user profile
      const profile = await this.getUserProfile(userId);
      
      // Update behavior history
      profile.behaviors = profile.behaviors || [];
      profile.behaviors.push({
        action,
        productId,
        category,
        searchQuery,
        sessionId,
        timestamp,
        metadata
      });
      
      // Keep only recent behaviors (last 1000)
      if (profile.behaviors.length > 1000) {
        profile.behaviors = profile.behaviors.slice(-1000);
      }
      
      // Update interest scores
      await this.updateInterestScores(profile, behavior);
      
      // Update user segments
      await this.updateUserSegmentation(userId, profile);
      
      // Save profile
      await this.saveUserProfile(userId, profile);
      
      // Clear related caches
      await cacheService.delete(this.cacheKeys.personalizedContent(userId, 'products'));
      await cacheService.delete(this.cacheKeys.personalizedContent(userId, 'categories'));
      
      return profile;
      
    } catch (error) {
      console.error('Error tracking user behavior:', error);
      throw error;
    }
  }
  
  /**
   * Get comprehensive user profile for personalization
   */
  async getUserProfile(userId) {
    try {
      const cacheKey = this.cacheKeys.userProfile(userId);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Build profile from user data and behavior history
      const profile = await this.buildUserProfile(userId);
      
      // Cache for 1 hour
      await cacheService.set(cacheKey, profile, 3600);
      
      return profile;
      
    } catch (error) {
      console.error('Error getting user profile:', error);
      return this.getDefaultProfile();
    }
  }
  
  /**
   * Build comprehensive user profile
   */
  async buildUserProfile(userId) {
    try {
      // Get user basic info
      const user = await User.findById(userId).lean();
      
      // Get user's order history
      const orders = await Order.find({
        'customerInfo.userId': userId,
        status: { $in: ['delivered', 'processing', 'shipped'] }
      }).populate('items.productId').lean();
      
      // Initialize profile
      const profile = {
        userId,
        demographics: {
          age: user?.age || null,
          gender: user?.gender || null,
          location: user?.address?.city || null,
          registrationDate: user?.createdAt || new Date()
        },
        preferences: {
          categories: {},
          priceRanges: {},
          brands: {},
          ageRanges: {},
          colors: {},
          sizes: {}
        },
        behaviors: [],
        purchaseHistory: {
          totalOrders: orders.length,
          totalSpent: 0,
          averageOrderValue: 0,
          favoriteCategories: [],
          lastOrderDate: null,
          frequency: 'new' // new, occasional, regular, frequent, vip
        },
        interests: {},
        segments: [],
        lifetimeValue: 0,
        riskScore: 0, // churn prediction
        personalizationScore: 0,
        lastUpdated: new Date()
      };
      
      // Analyze purchase history
      if (orders.length > 0) {
        profile.purchaseHistory = this.analyzePurchaseHistory(orders);
        profile.lifetimeValue = profile.purchaseHistory.totalSpent;
      }
      
      // Build interest scores from purchase history
      await this.buildInterestScoresFromHistory(profile, orders);
      
      // Calculate personalization score
      profile.personalizationScore = this.calculatePersonalizationScore(profile);
      
      return profile;
      
    } catch (error) {
      console.error('Error building user profile:', error);
      return this.getDefaultProfile();
    }
  }
  
  /**
   * Get personalized content for user
   */
  async getPersonalizedContent(userId, contentType, options = {}) {
    try {
      const { limit = 10, refresh = false } = options;
      
      const cacheKey = `${this.cacheKeys.personalizedContent(userId, contentType)}:${limit}`;
      
      if (!refresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }
      
      const profile = await this.getUserProfile(userId);
      let content = [];
      
      switch (contentType) {
        case 'products':
          content = await this.getPersonalizedProducts(userId, profile, options);
          break;
        case 'categories':
          content = await this.getPersonalizedCategories(userId, profile, options);
          break;
        case 'deals':
          content = await this.getPersonalizedDeals(userId, profile, options);
          break;
        case 'homepage':
          content = await this.getPersonalizedHomepage(userId, profile, options);
          break;
        case 'emails':
          content = await this.getPersonalizedEmailContent(userId, profile, options);
          break;
        default:
          content = [];
      }
      
      // Cache results
      await cacheService.set(cacheKey, content, 1800); // 30 minutes
      
      return content;
      
    } catch (error) {
      console.error('Error getting personalized content:', error);
      return [];
    }
  }
  
  /**
   * Get personalized product recommendations
   */
  async getPersonalizedProducts(userId, profile, options = {}) {
    try {
      const { limit = 20 } = options;
      
      // Get base recommendations
      const recommendations = await recommendationService.getRecommendations(userId, {
        algorithm: 'hybrid',
        limit: limit * 2
      });
      
      // Apply personalization scoring
      const personalizedProducts = recommendations.map(product => {
        const personalizedScore = this.calculateProductPersonalizationScore(product, profile);
        
        return {
          ...product,
          personalizedScore,
          originalScore: product.recommendationScore,
          finalScore: (product.recommendationScore || 1) * personalizedScore,
          personalizedReason: this.getPersonalizationReason(product, profile)
        };
      });
      
      // Sort by final score and return top products
      return personalizedProducts
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting personalized products:', error);
      return [];
    }
  }
  
  /**
   * Get personalized category recommendations
   */
  async getPersonalizedCategories(userId, profile, options = {}) {
    try {
      const { limit = 10 } = options;
      
      // Get all categories with user interest scores
      const categoryInterests = Object.entries(profile.interests)
        .filter(([key]) => key.startsWith('category_'))
        .map(([key, score]) => ({
          category: key.replace('category_', ''),
          score,
          reason: 'Based on your browsing and purchase history'
        }))
        .sort((a, b) => b.score - a.score);
      
      // Add categories from purchase history
      const purchaseCategories = Object.entries(profile.preferences.categories)
        .map(([category, count]) => ({
          category,
          score: count * 10, // Weight purchases heavily
          reason: `You've purchased ${count} items from this category`
        }));
      
      // Combine and deduplicate
      const combinedCategories = new Map();
      
      [...categoryInterests, ...purchaseCategories].forEach(item => {
        const existing = combinedCategories.get(item.category);
        if (!existing || existing.score < item.score) {
          combinedCategories.set(item.category, item);
        }
      });
      
      return Array.from(combinedCategories.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting personalized categories:', error);
      return [];
    }
  }
  
  /**
   * Get personalized deals and offers
   */
  async getPersonalizedDeals(userId, profile, options = {}) {
    try {
      const { limit = 10 } = options;
      
      // Get products on sale that match user interests
      const dealsProducts = await Product.find({
        status: 'active',
        old_price: { $exists: true, $gt: 0 },
        $expr: {
          $gt: ['$old_price', '$new_price']
        }
      }).lean();
      
      // Score deals based on user profile
      const personalizedDeals = dealsProducts.map(product => {
        const personalizedScore = this.calculateProductPersonalizationScore(product, profile);
        const discount = ((product.old_price - product.new_price) / product.old_price) * 100;
        
        return {
          ...product,
          discount: Math.round(discount),
          savings: product.old_price - product.new_price,
          personalizedScore,
          finalScore: personalizedScore * (1 + discount / 100), // Boost score by discount
          reason: `${Math.round(discount)}% off - matches your interests in ${product.category}`
        };
      });
      
      return personalizedDeals
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting personalized deals:', error);
      return [];
    }
  }
  
  /**
   * Get personalized homepage content
   */
  async getPersonalizedHomepage(userId, profile, options = {}) {
    try {
      const homepage = {
        hero: await this.getPersonalizedHeroContent(userId, profile),
        featuredProducts: await this.getPersonalizedProducts(userId, profile, { limit: 8 }),
        categories: await this.getPersonalizedCategories(userId, profile, { limit: 6 }),
        deals: await this.getPersonalizedDeals(userId, profile, { limit: 6 }),
        recommendations: {
          title: this.getPersonalizedRecommendationTitle(profile),
          products: await this.getPersonalizedProducts(userId, profile, { limit: 12 })
        },
        recentlyViewed: await this.getRecentlyViewedProducts(userId, 8),
        trending: await recommendationService.getTrendingProducts(userId, { limit: 8 })
      };
      
      return homepage;
      
    } catch (error) {
      console.error('Error getting personalized homepage:', error);
      return {};
    }
  }
  
  /**
   * Analyze purchase history
   */
  analyzePurchaseHistory(orders) {
    const analysis = {
      totalOrders: orders.length,
      totalSpent: 0,
      averageOrderValue: 0,
      favoriteCategories: [],
      lastOrderDate: null,
      frequency: 'new',
      categoryBreakdown: {},
      monthlySpending: {},
      averageItemsPerOrder: 0
    };
    
    let totalItems = 0;
    const categorySpending = {};
    const monthlySales = {};
    
    orders.forEach(order => {
      analysis.totalSpent += order.total || 0;
      
      if (!analysis.lastOrderDate || order.createdAt > analysis.lastOrderDate) {
        analysis.lastOrderDate = order.createdAt;
      }
      
      const month = order.createdAt.toISOString().substr(0, 7);
      monthlySales[month] = (monthlySales[month] || 0) + (order.total || 0);
      
      order.items.forEach(item => {
        totalItems++;
        
        if (item.productId && item.productId.category) {
          const category = item.productId.category;
          categorySpending[category] = (categorySpending[category] || 0) + 
            (item.quantity * item.price);
        }
      });
    });
    
    analysis.averageOrderValue = analysis.totalSpent / analysis.totalOrders;
    analysis.averageItemsPerOrder = totalItems / analysis.totalOrders;
    analysis.monthlySpending = monthlySales;
    
    // Determine favorite categories
    analysis.favoriteCategories = Object.entries(categorySpending)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, spent]) => ({ category, spent }));
    
    // Determine purchase frequency
    const daysSinceFirst = orders.length > 1 ? 
      (new Date() - new Date(Math.min(...orders.map(o => o.createdAt)))) / (1000 * 60 * 60 * 24) : 
      0;
    
    const ordersPerMonth = daysSinceFirst > 0 ? (orders.length / daysSinceFirst) * 30 : 0;
    
    if (ordersPerMonth >= 4) analysis.frequency = 'vip';
    else if (ordersPerMonth >= 2) analysis.frequency = 'frequent';
    else if (ordersPerMonth >= 1) analysis.frequency = 'regular';
    else if (orders.length > 1) analysis.frequency = 'occasional';
    
    return analysis;
  }
  
  /**
   * Build interest scores from purchase history
   */
  async buildInterestScoresFromHistory(profile, orders) {
    const interests = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId) {
          const product = item.productId;
          const weight = item.quantity * this.behaviorWeights.purchase;
          
          // Category interests
          if (product.category) {
            const key = `category_${product.category}`;
            interests[key] = (interests[key] || 0) + weight;
          }
          
          // Price range interests
          const priceRange = this.getPriceRange(product.new_price);
          const priceKey = `price_${priceRange}`;
          interests[priceKey] = (interests[priceKey] || 0) + weight;
          
          // Brand interests
          if (product.brand) {
            const brandKey = `brand_${product.brand}`;
            interests[brandKey] = (interests[brandKey] || 0) + weight;
          }
          
          // Age range interests
          if (product.age_range) {
            const ageKey = `age_${product.age_range}`;
            interests[ageKey] = (interests[ageKey] || 0) + weight;
          }
        }
      });
    });
    
    // Normalize interests
    const maxScore = Math.max(...Object.values(interests), 1);
    Object.keys(interests).forEach(key => {
      interests[key] = Math.min(
        (interests[key] / maxScore) * this.maxInterestScore,
        this.maxInterestScore
      );
    });
    
    profile.interests = interests;
  }
  
  /**
   * Update interest scores based on behavior
   */
  async updateInterestScores(profile, behavior) {
    const { action, productId, category, searchQuery } = behavior;
    const weight = this.behaviorWeights[action] || 1;
    
    // Apply time decay to existing interests
    this.applyTimeDecay(profile.interests);
    
    if (productId) {
      const product = await Product.findById(productId).lean();
      if (product) {
        // Category interest
        if (product.category) {
          const key = `category_${product.category}`;
          profile.interests[key] = Math.min(
            (profile.interests[key] || 0) + weight,
            this.maxInterestScore
          );
        }
        
        // Price range interest
        const priceRange = this.getPriceRange(product.new_price);
        const priceKey = `price_${priceRange}`;
        profile.interests[priceKey] = Math.min(
          (profile.interests[priceKey] || 0) + weight,
          this.maxInterestScore
        );
        
        // Brand interest
        if (product.brand) {
          const brandKey = `brand_${product.brand}`;
          profile.interests[brandKey] = Math.min(
            (profile.interests[brandKey] || 0) + weight,
            this.maxInterestScore
          );
        }
      }
    } else if (category) {
      // Direct category interaction
      const key = `category_${category}`;
      profile.interests[key] = Math.min(
        (profile.interests[key] || 0) + weight,
        this.maxInterestScore
      );
    }
    
    // Process search queries for interest extraction
    if (searchQuery && action === 'search') {
      await this.processSearchQuery(profile, searchQuery, weight);
    }
  }
  
  /**
   * Update user segmentation
   */
  async updateUserSegmentation(userId, profile) {
    try {
      const segments = [];
      
      // Value-based segments
      if (profile.lifetimeValue >= 1000) segments.push('high-value');
      else if (profile.lifetimeValue >= 500) segments.push('mid-value');
      else segments.push('low-value');
      
      // Frequency-based segments
      segments.push(`frequency-${profile.purchaseHistory.frequency}`);
      
      // Category-based segments
      const topCategories = Object.entries(profile.preferences.categories)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 2)
        .map(([category]) => `interested-${category}`);
      
      segments.push(...topCategories);
      
      // Behavior-based segments
      const recentBehaviors = profile.behaviors
        .filter(b => new Date() - new Date(b.timestamp) < 7 * 24 * 60 * 60 * 1000) // Last 7 days
        .reduce((acc, b) => {
          acc[b.action] = (acc[b.action] || 0) + 1;
          return acc;
        }, {});
      
      if (recentBehaviors.view >= 20) segments.push('browser');
      if (recentBehaviors.addToCart >= 5) segments.push('cart-heavy');
      if (recentBehaviors.purchase >= 2) segments.push('frequent-buyer');
      
      // Age-based segments (if available)
      if (profile.demographics.age) {
        if (profile.demographics.age < 30) segments.push('young-parent');
        else if (profile.demographics.age >= 30 && profile.demographics.age < 45) segments.push('mid-age-parent');
        else segments.push('mature-parent');
      }
      
      profile.segments = segments;
      
      // Cache user segment
      await cacheService.set(this.cacheKeys.userSegment(userId), segments, 86400);
      
    } catch (error) {
      console.error('Error updating user segmentation:', error);
    }
  }
  
  /**
   * Calculate product personalization score
   */
  calculateProductPersonalizationScore(product, profile) {
    let score = 1; // Base score
    
    // Category match
    const categoryKey = `category_${product.category}`;
    if (profile.interests[categoryKey]) {
      score *= 1 + (profile.interests[categoryKey] / this.maxInterestScore);
    }
    
    // Price range match
    const priceRange = this.getPriceRange(product.new_price);
    const priceKey = `price_${priceRange}`;
    if (profile.interests[priceKey]) {
      score *= 1 + (profile.interests[priceKey] / this.maxInterestScore * 0.5);
    }
    
    // Brand match
    if (product.brand) {
      const brandKey = `brand_${product.brand}`;
      if (profile.interests[brandKey]) {
        score *= 1 + (profile.interests[brandKey] / this.maxInterestScore * 0.3);
      }
    }
    
    // Age appropriateness (if user has children of specific ages)
    if (product.age_range) {
      const ageKey = `age_${product.age_range}`;
      if (profile.interests[ageKey]) {
        score *= 1 + (profile.interests[ageKey] / this.maxInterestScore * 0.7);
      }
    }
    
    return Math.min(score, 5); // Cap the multiplier
  }
  
  /**
   * Helper methods
   */
  
  applyTimeDecay(interests) {
    Object.keys(interests).forEach(key => {
      interests[key] = Math.max(interests[key] * (1 - this.decayFactor), 0);
    });
  }
  
  getPriceRange(price) {
    if (price <= 20) return 'low';
    if (price <= 50) return 'medium';
    if (price <= 100) return 'high';
    return 'premium';
  }
  
  async processSearchQuery(profile, query, weight) {
    // Simple keyword extraction - in production, use NLP
    const keywords = query.toLowerCase().split(/\s+/);
    
    keywords.forEach(keyword => {
      const key = `search_${keyword}`;
      profile.interests[key] = Math.min(
        (profile.interests[key] || 0) + weight * 0.5,
        this.maxInterestScore
      );
    });
  }
  
  calculatePersonalizationScore(profile) {
    // Score based on data richness and engagement
    let score = 0;
    
    // Behavior diversity (max 30 points)
    const behaviorTypes = new Set(profile.behaviors.map(b => b.action));
    score += Math.min(behaviorTypes.size * 5, 30);
    
    // Purchase history (max 40 points)
    score += Math.min(profile.purchaseHistory.totalOrders * 2, 40);
    
    // Interest diversity (max 20 points)
    score += Math.min(Object.keys(profile.interests).length, 20);
    
    // Recent activity (max 10 points)
    const recentBehaviors = profile.behaviors.filter(
      b => new Date() - new Date(b.timestamp) < 7 * 24 * 60 * 60 * 1000
    );
    score += Math.min(recentBehaviors.length * 0.5, 10);
    
    return Math.min(score, 100);
  }
  
  getPersonalizationReason(product, profile) {
    const reasons = [];
    
    const categoryKey = `category_${product.category}`;
    if (profile.interests[categoryKey] && profile.interests[categoryKey] > 50) {
      reasons.push(`You frequently browse ${product.category}`);
    }
    
    const priceRange = this.getPriceRange(product.new_price);
    const priceKey = `price_${priceRange}`;
    if (profile.interests[priceKey] && profile.interests[priceKey] > 30) {
      reasons.push(`Matches your ${priceRange} price preference`);
    }
    
    if (product.brand) {
      const brandKey = `brand_${product.brand}`;
      if (profile.interests[brandKey] && profile.interests[brandKey] > 40) {
        reasons.push(`You like ${product.brand} products`);
      }
    }
    
    return reasons.length > 0 ? reasons.join(', ') : 'Recommended for you';
  }
  
  getPersonalizedRecommendationTitle(profile) {
    const titles = [
      'Recommended for You',
      'Based on Your Preferences',
      'You Might Love These',
      'Picked Just for You',
      'Your Personal Favorites'
    ];
    
    // Choose title based on user segment
    if (profile.segments.includes('high-value')) {
      return 'Exclusive Recommendations';
    } else if (profile.segments.includes('frequent-buyer')) {
      return 'More Items You\'ll Love';
    } else if (profile.segments.includes('browser')) {
      return 'Based on What You\'ve Viewed';
    }
    
    return titles[Math.floor(Math.random() * titles.length)];
  }
  
  async getPersonalizedHeroContent(userId, profile) {
    // Return hero content based on user interests and segments
    const topCategory = Object.entries(profile.interests)
      .filter(([key]) => key.startsWith('category_'))
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topCategory) {
      const category = topCategory[0].replace('category_', '');
      return {
        title: `New ${category} Collection`,
        subtitle: 'Discover the latest styles in your favorite category',
        cta: `Shop ${category}`,
        backgroundImage: `/images/hero-${category}.jpg`
      };
    }
    
    return {
      title: 'Discover Amazing Kids Fashion',
      subtitle: 'Quality clothing for every adventure',
      cta: 'Shop Now',
      backgroundImage: '/images/hero-default.jpg'
    };
  }
  
  async getRecentlyViewedProducts(userId, limit = 8) {
    try {
      const profile = await this.getUserProfile(userId);
      const recentViews = profile.behaviors
        .filter(b => b.action === 'view' && b.productId)
        .slice(-limit)
        .reverse();
      
      const productIds = [...new Set(recentViews.map(b => b.productId))];
      
      if (productIds.length === 0) {
        return [];
      }
      
      const products = await Product.find({
        _id: { $in: productIds },
        status: 'active'
      }).lean();
      
      // Maintain order of recent views
      return productIds
        .map(id => products.find(p => p._id.toString() === id))
        .filter(Boolean)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting recently viewed products:', error);
      return [];
    }
  }
  
  getDefaultProfile() {
    return {
      userId: null,
      demographics: {},
      preferences: {
        categories: {},
        priceRanges: {},
        brands: {},
        ageRanges: {},
        colors: {},
        sizes: {}
      },
      behaviors: [],
      purchaseHistory: {
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        favoriteCategories: [],
        lastOrderDate: null,
        frequency: 'new'
      },
      interests: {},
      segments: ['new-user'],
      lifetimeValue: 0,
      riskScore: 0,
      personalizationScore: 0,
      lastUpdated: new Date()
    };
  }
  
  async saveUserProfile(userId, profile) {
    try {
      await cacheService.set(this.cacheKeys.userProfile(userId), profile, 3600);
      
      // Also update user preferences in database
      await User.findByIdAndUpdate(userId, {
        $set: {
          'preferences.personalization': {
            segments: profile.segments,
            interests: profile.interests,
            personalizationScore: profile.personalizationScore,
            lastUpdated: profile.lastUpdated
          }
        }
      });
      
    } catch (error) {
      console.error('Error saving user profile:', error);
    }
  }
  
  /**
   * Clear all personalization data for a user
   */
  async clearUserPersonalization(userId) {
    try {
      const patterns = [
        `personalization:profile:${userId}`,
        `personalization:behavior:${userId}`,
        `personalization:preferences:${userId}`,
        `personalization:content:${userId}:*`,
        `personalization:segment:${userId}`
      ];
      
      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          await cacheService.deletePattern(pattern);
        } else {
          await cacheService.delete(pattern);
        }
      }
      
    } catch (error) {
      console.error('Error clearing user personalization:', error);
    }
  }
}

module.exports = new PersonalizationService();
