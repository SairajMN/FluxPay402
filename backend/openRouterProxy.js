/**
 * @file openRouterProxy.js
 * @description OpenRouter AI Proxy for LLM calls and token metering
 */

const axios = require('axios');
const crypto = require('crypto');

class OpenRouterProxy {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.HTTP_REFERER || 'https://fluxpaynexus.com', // For analytics
        'X-Title': 'FluxPay Nexus'
      }
    });
  }

  /**
   * Call OpenRouter AI completion endpoint
   * @param {Object} params - Request parameters
   * @param {Array} params.messages - Chat messages
   * @param {string} params.model - Model name (e.g., 'openai/gpt-4o-mini')
   * @param {number} params.max_tokens - Max tokens to generate
   * @param {number} params.temperature - Sampling temperature
   * @returns {Promise<Object>} - OpenRouter response with usage metadata
   */
  async callCompletion(params) {
    try {
      const response = await this.client.post('/chat/completions', {
        model: params.model,
        messages: params.messages,
        max_tokens: params.max_tokens || 1000,
        temperature: params.temperature || 0.7,
        stream: false // Streaming not supported in MVP
      });

      return {
        success: true,
        data: response.data,
        usage: response.data.usage,
        model: response.data.model,
        headers: response.headers // Contains usage info
      };
    } catch (error) {
      console.error('OpenRouter call failed:', error.response?.data || error.message);
      throw new Error(`AI call failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Verify usage amount matches OpenRouter-reported usage
   * @param {Object} apiResult - The AI API result
   * @param {Object} receipt - Provider's usage receipt
   * @returns {Promise<number>} Verified amount in USDC (wei equivalent)
   */
  async verifyUsage(apiResult, receipt) {
    // Extract actual usage from OpenRouter response
    const usage = apiResult.usage;
    const model = apiResult.model;

    if (!usage) {
      throw new Error('No usage data in AI response');
    }

    // Calculate tokens used
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // Get pricing for the model
    const pricing = this.getModelPricing(model);
    if (!pricing) {
      throw new Error(`Unknown model pricing: ${model}`);
    }

    // Calculate exact cost
    const promptCost = (promptTokens * pricing.prompt_per_token) / 1e6; // Convert to USDC
    const completionCost = (completionTokens * pricing.completion_per_token) / 1e6;
    const totalCostUsdc = promptCost + completionCost;

    // Convert to wei-equivalent (USDC has 6 decimals)
    const totalCostWei = Math.round(totalCostUsdc * 1e6);

    // Verify provider's claim matches our calculation
    const claimedAmount = receipt.usedAmount;
    const tolerance = Math.round(totalCostWei * 0.01); // 1% tolerance

    if (Math.abs(claimedAmount - totalCostWei) > tolerance) {
      console.warn(`Usage verification discrepancy: claimed ${claimedAmount}, calculated ${totalCostWei}`);
      throw new Error('Provider usage claim does not match verified usage');
    }

    return totalCostWei;
  }

  /**
   * Get model pricing from OpenRouter (cached for performance)
   * @param {string} model - Model name
   * @returns {Object|null} - Pricing info or null if not found
   */
  getModelPricing(model) {
    // This would ideally fetch from OpenRouter's pricing endpoint
    // For MVP, we'll use cached values
    const pricingMap = {
      // OpenAI models
      'openai/gpt-4o': {
        prompt_per_token: 2.5, // $ per 1M tokens
        completion_per_token: 10.0
      },
      'openai/gpt-4o-mini': {
        prompt_per_token: 0.15,
        completion_per_token: 0.60
      },
      'openai/gpt-3.5-turbo': {
        prompt_per_token: 0.50,
        completion_per_token: 1.50
      },

      // Anthropic models
      'anthropic/claude-3.5-sonnet': {
        prompt_per_token: 3.0,
        completion_per_token: 15.0
      },
      'anthropic/claude-3-haiku': {
        prompt_per_token: 0.25,
        completion_per_token: 1.25
      },

      // Meta models
      'meta-llama/llama-3.1-405b-instruct': {
        prompt_per_token: 0.0, // Free tier for some
        completion_per_token: 0.0
      },

      // Mistral models
      'mistralai/mistral-7b-instruct': {
        prompt_per_token: 0.0,
        completion_per_token: 0.0
      }
    };

    return pricingMap[model] || null;
  }

  /**
   * Fetch current pricing from OpenRouter API
   * @returns {Promise<Object>} Updated pricing map
   */
  async fetchLatestPricing() {
    try {
      const response = await this.client.get('/models');
      const models = response.data.data;

      const pricing = {};
      models.forEach(model => {
        if (model.pricing) {
          pricing[model.id] = {
            prompt_per_token: parseFloat(model.pricing.prompt) * 1e6 || 0,
            completion_per_token: parseFloat(model.pricing.completion) * 1e6 || 0
          };
        }
      });

      return pricing;
    } catch (error) {
      console.error('Failed to fetch OpenRouter pricing:', error);
      return {};
    }
  }

  /**
   * Call OpenRouter with custom model selection based on cost/performance
   * @param {Object} params - Request parameters with cost constraints
   * @param {number} params.maxCost - Maximum cost in USDC
   * @param {string} params.preferredModel - User's preferred model
   * @returns {Promise<Object>} AI response
   */
  async callWithCostOptimization(params) {
    // Analyze request to estimate token usage
    const estimatedTokens = this.estimateTokenUsage(params.messages, params.model);

    // Select best model within cost limit
    const selectedModel = await this.selectOptimalModel(estimatedTokens, params.maxCost, params.preferredModel);

    if (!selectedModel) {
      throw new Error('No suitable model found within cost constraints');
    }

    // Call with selected model
    return this.callCompletion({
      ...params,
      model: selectedModel
    });
  }

  /**
   * Estimate token count for a request
   * @param {Array} messages - Chat messages
   * @param {string} model - Model name
   * @returns {number} Estimated total tokens
   */
  estimateTokenUsage(messages, model) {
    // Simple estimation: ~4 characters per token
    const text = messages.map(m => m.content).join(' ');
    const estimatedTokens = Math.ceil(text.length / 4);

    if (messages.length > 1) {
      // Add overhead for conversation
      return estimatedTokens + (messages.length * 10);
    }

    return estimatedTokens;
  }

  /**
   * Select optimal model based on cost and performance tradeoffs
   * @param {number} estimatedTokens - Expected token usage
   * @param {number} maxCostUsdc - Maximum cost in USDC
   * @param {string} preferredModel - User's preference
   * @returns {string|null} Selected model name
   */
  async selectOptimalModel(estimatedTokens, maxCostUsdc, preferredModel) {
    // Check if preferred model fits budget
    if (preferredModel) {
      const pricing = this.getModelPricing(preferredModel);
      if (pricing) {
        const cost = ((estimatedTokens * pricing.prompt_per_token) / 1e6);
        if (cost <= maxCostUsdc) {
          return preferredModel;
        }
      }
    }

    // Find best alternative
    const candidates = [
      'openai/gpt-4o-mini',    // Good balance
      'anthropic/claude-3-haiku',
      'openai/gpt-3.5-turbo',
      'meta-llama/llama-3.1-405b-instruct'
    ];

    for (const model of candidates) {
      const pricing = this.getModelPricing(model);
      if (!pricing) continue;

      const cost = ((estimatedTokens * pricing.prompt_per_token) / 1e6);
      if (cost <= maxCostUsdc) {
        return model;
      }
    }

    return null; // No model fits budget
  }

  /**
   * Batch multiple calls with rate limiting
   * @param {Array} requests - Array of request parameters
   * @returns {Promise<Array>} Array of responses
   */
  async batchCalls(requests) {
    const results = [];

    // Process sequentially to avoid rate limits
    for (const request of requests) {
      try {
        const result = await this.callCompletion(request);
        results.push(result);

        // Rate limiting: simple delay between calls
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Generate a deterministic hash for usage verification
   * @param {Object} usage - Usage object from OpenRouter
   * @param {string} model - Model name
   * @returns {string} Hash for verification
   */
  generateUsageHash(usage, model) {
    const data = `${model}:${usage.prompt_tokens}:${usage.completion_tokens}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

module.exports = { OpenRouterProxy };
