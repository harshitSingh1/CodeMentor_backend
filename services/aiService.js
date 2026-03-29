const OpenAI = require('openai');
const NodeCache = require('node-cache');
const config = require('../config');
const queueService = require('./queueService');

const cache = new NodeCache({ stdTTL: config.cache.ttl });

class AIService {
  constructor() {
    this.client = new OpenAI({
      baseURL: config.featherless.baseUrl,
      apiKey: config.featherless.apiKey,
      timeout: config.featherless.timeout
    });
    
    this.models = [
      config.featherless.model,
      'Qwen/Qwen2.5-Coder-14B-Instruct',
      'microsoft/Phi-4-mini-instruct'
    ];
  }

  async callModel(prompt, options = {}) {
    const cacheKey = `prompt_${Buffer.from(prompt).toString('base64').slice(0, 100)}`;
    const cached = cache.get(cacheKey);
    if (cached && !options.skipCache) return cached;

    return queueService.add(async () => {
      let lastError = null;
      
      for (const model of this.models) {
        try {
          const completion = await this.client.chat.completions.create({
            model: model,
            messages: [
              {
                role: 'system',
                content: `You are an elite DSA mentor. Never give complete solutions. Use markdown with emojis. Be concise.`
              },
              { role: 'user', content: prompt }
            ],
            temperature: options.temperature || config.featherless.temperature,
            max_tokens: options.maxTokens || 500,
            top_p: 0.9
          });
          
          const result = completion.choices[0].message.content;
          if (!options.skipCache) cache.set(cacheKey, result);
          return result;
          
        } catch (error) {
          lastError = error;
          if (error.message.includes('429')) await new Promise(r => setTimeout(r, 3000));
        }
      }
      throw lastError || new Error('All models failed');
    });
  }

  async processQuery({ query, problemData, chatHistory }) {
    const prompt = this.buildQueryPrompt({ query, problemData, chatHistory });
    const rawResponse = await this.callModel(prompt);
    return this.parseAIResponse(rawResponse);
  }

  async generateHint(level, problemData) {
    const prompt = this.buildHintPrompt(level, problemData);
    const hint = await this.callModel(prompt, { temperature: 0.6, maxTokens: 200 });
    
    return hint.trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .substring(0, 300);
  }

  buildQueryPrompt({ query, problemData, chatHistory }) {
    return `
You are an elite DSA mentor. Never give complete solutions.

PROBLEM:
Title: ${problemData?.title || 'Unknown'}
Description: ${(problemData?.description || problemData?.fullProblemText || '').substring(0, 1000)}
Difficulty: ${problemData?.difficulty || 'Unknown'}

CHAT HISTORY:
${(chatHistory || []).slice(-6).map(m => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')}

USER: ${query}

RESPONSE FORMAT (JSON):
{
  "reply": "Your response with markdown and emojis",
  "approaches": [
    {"name": "Approach name", "idea": "1 sentence", "time": "O(...)", "space": "O(...)"}
  ]
}

Return ONLY valid JSON.`;
  }

  buildHintPrompt(level, problemData) {
    const levels = {
      1: 'Intuition (1-2 sentences)',
      2: 'Approach Outline (2-3 sentences)',
      3: 'Key Observation (2-3 sentences)'
    };
    
    return `
Provide a LEVEL ${level} hint for: ${problemData?.title || 'Unknown problem'}

${levels[level]}

Description: ${(problemData?.description || '').substring(0, 500)}

RULES: NO code, be concise, guide thinking.

Return ONLY the hint text.`;
  }

  parseAIResponse(raw) {
    try {
      let cleaned = raw.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');
      
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reply: parsed.reply || cleaned.substring(0, 500),
          approaches: parsed.approaches || []
        };
      }
      return { reply: cleaned.substring(0, 500), approaches: [] };
    } catch {
      return { reply: raw.substring(0, 500), approaches: [] };
    }
  }

  getQueueStatus() {
    return queueService.getStats();
  }
}

module.exports = new AIService();