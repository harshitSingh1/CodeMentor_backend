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
          console.log(`[AI] Trying model: ${model}`);
          const completion = await this.client.chat.completions.create({
            model: model,
            messages: [
              {
                role: 'system',
                content: `You are an elite DSA mentor. Help students learn by explaining concepts clearly.
                - Give helpful explanations about approaches, time complexity, and trade-offs
                - Provide pseudo-code or high-level code structure when asked
                - NEVER give complete copy-paste solutions for the exact problem
                - Use markdown with emojis for better readability
                - Be conversational and encouraging`
              },
              { role: 'user', content: prompt }
            ],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 800,
            top_p: 0.9
          });
          
          const result = completion.choices[0].message.content;
          console.log(`[AI] Got response from ${model}, length: ${result?.length || 0}`);
          if (!options.skipCache) cache.set(cacheKey, result);
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
    const prompt = this.buildQueryPrompt({ query, problemData, chatHistory });
    console.log('[AI] Processing query:', query.substring(0, 100));
    
    const rawResponse = await this.callModel(prompt);
    const parsed = this.parseAIResponse(rawResponse);
    
    console.log('[AI] Parsed response reply length:', parsed.reply?.length || 0);
    return parsed;
  }

  async generateHint(level, problemData) {
    const prompt = this.buildHintPrompt(level, problemData);
    const hint = await this.callModel(prompt, { temperature: 0.6, maxTokens: 300 });
    
    // Clean up the hint
    let cleanHint = hint.trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^\{\s*"hint":\s*"/i, '')
      .replace(/"\s*\}$/i, '');
    
    return cleanHint.substring(0, 500);
  }

  buildQueryPrompt({ query, problemData, chatHistory }) {
    // Get the last few messages for context
    const recentHistory = (chatHistory || []).slice(-8);
    let historyText = '';
    if (recentHistory.length > 0) {
      historyText = '\nCONVERSATION HISTORY:\n';
      recentHistory.forEach(m => {
        historyText += `${m.role === 'user' ? 'Student' : 'Mentor'}: ${m.content}\n`;
      });
    }

    return `You are an expert DSA mentor helping a student solve a coding problem.

PROBLEM DETAILS:
Title: ${problemData?.title || 'Unknown'}
Difficulty: ${problemData?.difficulty || 'Unknown'}
Description: ${(problemData?.description || problemData?.fullProblemText || '').substring(0, 1500)}
Platform: ${problemData?.platform || 'Unknown'}

${historyText}

STUDENT'S QUESTION: ${query}

IMPORTANT RULES:
1. Be helpful and educational - explain concepts clearly
2. If the student asks for code, provide PSEUDO-CODE or high-level structure, NOT the complete solution
3. Compare different approaches with time/space complexity
4. Use emojis (💡, ⚡, 📊, 🎯, ⚠️) to make responses engaging
5. If the student seems stuck, ask guiding questions

RESPONSE FORMAT (Return ONLY valid JSON, no other text):
{
  "reply": "Your detailed helpful response using markdown",
  "approaches": [
    {
      "name": "Approach Name",
      "idea": "Brief description of the approach",
      "time": "Time complexity (e.g., O(n), O(n log n))",
      "space": "Space complexity (e.g., O(1), O(n))"
    }
  ]
}

Example response for "how to solve two sum":
{
  "reply": "Great question! For the Two Sum problem, there are a few approaches:\\n\\n**1. Brute Force** 💪\\n- Check every pair of numbers\\n- Time: O(n²), Space: O(1)\\n- Simple but slow for large arrays\\n\\n**2. Hash Map** 🗺️\\n- Store seen numbers in a hash map\\n- For each number, check if target - num exists\\n- Time: O(n), Space: O(n)\\n- Best for most cases\\n\\nWould you like me to explain the hash map approach in more detail?",
  "approaches": [
    {
      "name": "Brute Force",
      "idea": "Check every pair combination",
      "time": "O(n²)",
      "space": "O(1)"
    },
    {
      "name": "Hash Map",
      "idea": "Use hash map to store seen numbers for O(1) lookup",
      "time": "O(n)",
      "space": "O(n)"
    }
  ]
}

Now respond to the student's question. Remember: Be helpful, explain concepts, provide pseudo-code if asked for code, but never give the complete working solution.`;
  }

  buildHintPrompt(level, problemData) {
    const levelNames = {
      1: 'Intuition - A small nudge in the right direction',
      2: 'Approach Outline - The general strategy to solve',
      3: 'Key Observation - The crucial insight needed',
      4: 'Pseudo-code - High-level code structure'
    };
    
    return `You are a DSA mentor providing a hint for a problem.

PROBLEM:
Title: ${problemData?.title || 'Unknown'}
Difficulty: ${problemData?.difficulty || 'Unknown'}
Description: ${(problemData?.description || problemData?.fullProblemText || '').substring(0, 800)}

HINT LEVEL ${level}: ${levelNames[level] || 'General hint'}

RULES:
- DO NOT give the complete solution or full working code
- For level 4 (pseudo-code), provide only the high-level structure, not the implementation
- Keep the hint concise (2-5 sentences for levels 1-3, up to 10 lines for level 4)
- Guide the student's thinking

Return ONLY the hint text, no JSON, no extra formatting.`;
  }

  parseAIResponse(raw) {
    try {
      // Clean the raw response
      let cleaned = raw.trim();
      
      // Remove markdown code blocks
      cleaned = cleaned.replace(/^```json\s*/i, '');
      cleaned = cleaned.replace(/^```\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/i, '');
      
      // Try to find JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Ensure we have a valid reply
        let reply = parsed.reply || parsed.response || parsed.message || cleaned;
        
        // If reply is too short or generic, use the cleaned response
        if (reply.length < 20 && cleaned.length > 50) {
          reply = cleaned;
        }
        
        return {
          reply: reply,
          approaches: Array.isArray(parsed.approaches) ? parsed.approaches : []
        };
      }
      
      // If no JSON found, return the cleaned text as the reply
      return {
        reply: cleaned,
        approaches: this.extractApproachesFromText(cleaned)
      };
    } catch (error) {
      console.error('[AI] Parse error:', error.message);
      // Return the raw response as plain text
      return {
        reply: raw,
        approaches: []
      };
    }
  }

  extractApproachesFromText(text) {
    const approaches = [];
    
    // Try to extract approaches from markdown
    const lines = text.split('\n');
    let currentApproach = null;
    
    for (const line of lines) {
      // Look for approach headers like "**1. Brute Force**" or "## Approach 1"
      const approachMatch = line.match(/\*\*(\d+\.\s*[^*]+)\*\*|##\s*Approach\s*\d+[:\s]*([^#\n]+)/i);
      if (approachMatch) {
        if (currentApproach) approaches.push(currentApproach);
        currentApproach = {
          name: (approachMatch[1] || approachMatch[2]).trim(),
          idea: '',
          time: 'O(n)',
          space: 'O(n)'
        };
      }
      
      // Look for time complexity
      if (currentApproach && line.match(/time|complexity/i)) {
        const timeMatch = line.match(/O\([^)]+\)/i);
        if (timeMatch) currentApproach.time = timeMatch[0];
      }
      
      // Look for space complexity
      if (currentApproach && line.match(/space/i)) {
        const spaceMatch = line.match(/O\([^)]+\)/i);
        if (spaceMatch) currentApproach.space = spaceMatch[0];
      }
      
      // Get idea (first sentence of approach description)
      if (currentApproach && !currentApproach.idea && line.trim() && !line.match(/^\*\*|^##/)) {
        currentApproach.idea = line.trim().substring(0, 100);
      }
    }
    
    if (currentApproach) approaches.push(currentApproach);
    
    return approaches.slice(0, 3);
  }

  getQueueStatus() {
    return queueService.getStats();
  }
}

module.exports = new AIService();