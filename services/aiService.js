const OpenAI = require('openai');
const NodeCache = require('node-cache');
const config = require('../config');
const queueService = require('./queueService');

// Use shorter cache TTL and be more selective about caching
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes instead of 1 hour

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
    // DON'T cache chat queries - they need fresh responses
    const skipCache = options.skipCache || true; // Default to skip cache for chat
    
    if (!skipCache) {
      const cacheKey = `prompt_${Buffer.from(prompt).toString('base64').slice(0, 100)}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
    }

    return queueService.add(async () => {
      let lastError = null;
      
      for (const model of this.models) {
        try {
          console.log(`[AI] Trying model: ${model}`);
          const completion = await this.client.chat.completions.create({
            model: model,
            messages: [
              {
                role: 'system',
                content: `You are an expert DSA mentor. Always focus on the CURRENT problem the student is working on.
                
CRITICAL RULES:
1. Pay attention to the problem title and description in each request
2. If the problem changed, completely forget the previous problem
3. Give detailed, helpful responses about the current problem only
4. Provide pseudo-code when asked, not complete solutions
5. Compare different approaches with time/space complexity
6. Use emojis (💡, ⚡, 📊, 🎯, ⚠️) to make responses engaging`
              },
              { role: 'user', content: prompt }
            ],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000,
            top_p: 0.9
          });
          
          const result = completion.choices[0].message.content;
          console.log(`[AI] Got response from ${model}, length: ${result?.length || 0}`);
          
          if (!skipCache && options.cacheable) {
            cache.set(cacheKey, result);
          }
          return result;
          
        } catch (error) {
          console.error(`[AI] Model ${model} failed:`, error.message);
          lastError = error;
          if (error.message.includes('429')) await new Promise(r => setTimeout(r, 3000));
        }
      }
      throw lastError || new Error('All models failed');
    });
  }

  async processQuery({ query, problemData, chatHistory }) {
    // Log the current problem to debug
    console.log(`[AI] Processing query for problem: ${problemData?.title || 'Unknown'}`);
    console.log(`[AI] Query: ${query}`);
    
    const prompt = this.buildQueryPrompt({ query, problemData, chatHistory });
    const rawResponse = await this.callModel(prompt, { skipCache: true, temperature: 0.7 });
    const parsed = this.parseAIResponse(rawResponse);
    
    return parsed;
  }

  async generateHint(level, problemData) {
    console.log(`[HINT] Generating level ${level} hint for: ${problemData?.title}`);
    
    const prompt = this.buildHintPrompt(level, problemData);
    const hint = await this.callModel(prompt, { skipCache: false, temperature: 0.6, maxTokens: 300 });
    
    let cleanHint = hint.trim()
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/^\{\s*"hint":\s*"/i, '')
      .replace(/"\s*\}$/i, '');
    
    return cleanHint.substring(0, 500);
  }

  buildQueryPrompt({ query, problemData, chatHistory }) {
    // Get the current problem clearly
    const currentProblem = `
CURRENT PROBLEM (THIS IS THE ONLY PROBLEM YOU SHOULD DISCUSS):
Title: ${problemData?.title || 'Unknown'}
Difficulty: ${problemData?.difficulty || 'Unknown'}
Platform: ${problemData?.platform || 'Unknown'}

Problem Description:
${(problemData?.description || problemData?.fullProblemText || '').substring(0, 2000)}
`;

    // Only include recent relevant chat history
    const recentHistory = (chatHistory || []).slice(-6);
    let historyText = '';
    if (recentHistory.length > 0) {
      historyText = '\nRECENT CONVERSATION (for context only, focus on current problem):\n';
      recentHistory.forEach(m => {
        historyText += `${m.role === 'user' ? 'Student' : 'Mentor'}: ${m.content}\n`;
      });
    }

    return `${currentProblem}

${historyText}

STUDENT'S QUESTION: ${query}

INSTRUCTIONS:
1. IGNORE any previous problems - ONLY discuss "${problemData?.title || 'the current problem'}"
2. If the student asks for the "best approach", compare 2-3 approaches with time/space complexity
3. If they ask for code, provide PSEUDO-CODE or high-level structure
4. Be detailed and educational - explain WHY approaches work
5. Use markdown with emojis for clarity

Return ONLY valid JSON in this exact format:
{
  "reply": "Your detailed response about the CURRENT problem only",
  "approaches": [
    {
      "name": "Approach 1 Name",
      "idea": "Brief description",
      "time": "O(...)",
      "space": "O(...)"
    }
  ]
}

Example for a grid problem like "Get Biggest Three Rhombus Sums":
{
  "reply": "For finding the biggest three rhombus sums in a grid, here are the main approaches:\\n\\n**1. Brute Force** 💪\\n- Iterate through all possible rhombus centers and sizes\\n- Calculate sums by traversing the rhombus perimeter\\n- Time: O(m * n * min(m,n)²), Space: O(1)\\n- Simple but slower for large grids\\n\\n**2. Prefix Sum Optimization** ⚡\\n- Precompute prefix sums for diagonals\\n- Calculate rhombus sums in O(1) time\\n- Time: O(m * n * min(m,n)), Space: O(m * n)\\n- Much faster for larger grids\\n\\nWould you like me to explain the prefix sum approach in more detail?",
  "approaches": [
    {
      "name": "Brute Force",
      "idea": "Check every possible rhombus center and size",
      "time": "O(m * n * k²)",
      "space": "O(1)"
    },
    {
      "name": "Prefix Sum Optimization",
      "idea": "Precompute diagonal prefix sums for O(1) rhombus sum calculation",
      "time": "O(m * n * k)",
      "space": "O(m * n)"
    }
  ]
}

Now respond about the CURRENT problem only. Be helpful and detailed.`;
  }

  buildHintPrompt(level, problemData) {
    const levelNames = {
      1: 'Intuition - Initial thought direction',
      2: 'Approach Outline - High-level strategy',
      3: 'Key Observation - Critical insight',
      4: 'Pseudo-code - Code structure'
    };
    
    return `Provide a hint for this problem:

PROBLEM: ${problemData?.title || 'Unknown'}
${(problemData?.description || problemData?.fullProblemText || '').substring(0, 800)}

HINT LEVEL ${level}: ${levelNames[level]}

Requirements:
- Level 1-2: 1-3 sentences, conceptual only
- Level 3: The key insight needed to solve efficiently
- Level 4: High-level pseudo-code structure (no implementation)

Return ONLY the hint text, no extra formatting.`;
  }

  parseAIResponse(raw) {
    try {
      let cleaned = raw.trim();
      
      // Remove markdown code blocks
      cleaned = cleaned.replace(/^```json\s*/i, '');
      cleaned = cleaned.replace(/^```\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/i, '');
      
      // Find JSON
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        let reply = parsed.reply || parsed.response || cleaned;
        
        // Ensure reply is substantial
        if (reply.length < 50 && cleaned.length > 100) {
          reply = cleaned;
        }
        
        return {
          reply: reply,
          approaches: Array.isArray(parsed.approaches) ? parsed.approaches : []
        };
      }
      
      // Return cleaned text as reply
      return {
        reply: cleaned,
        approaches: []
      };
    } catch (error) {
      console.error('[AI] Parse error:', error.message);
      return {
        reply: raw,
        approaches: []
      };
    }
  }

  getQueueStatus() {
    return queueService.getStats();
  }
}

module.exports = new AIService();