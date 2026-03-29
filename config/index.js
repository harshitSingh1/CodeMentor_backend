require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  featherless: {
    apiKey: process.env.FEATHERLESS_API_KEY,
    baseUrl: 'https://api.featherless.ai/v1',
    model: process.env.MODEL || 'Qwen/Qwen2.5-Coder-14B-Instruct',
    maxTokens: 2048,
    temperature: 0.7,
    timeout: 45000
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  },
  cache: {
    ttl: 3600
  }
};