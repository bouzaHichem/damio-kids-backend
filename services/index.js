// Services index file - centralized service exports

const InventoryService = require('./inventoryService');
const EmailService = require('./emailService');
const AnalyticsService = require('./analyticsService');
const SearchService = require('./searchService');

module.exports = {
  InventoryService,
  EmailService,
  AnalyticsService,
  SearchService
};
