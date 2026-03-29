const OpenAI = require('openai');
const NodeCache = require('node-cache');
const config = require('../config');
const queueService = require('./queueService');

const cache = new NodeCache({ stdTTL: 300 });

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
                content: `You are an expert DSA mentor. Be helpful and conversational.

IMPORTANT RULES:
1. REMEMBER the conversation history - respond to what the user just asked
2. If user says "yes please" or "share the code", provide what they requested in the previous message
3. Provide pseudo-code or actual code when asked, but explain it well
4. Use markdown with emojis for clarity
5. Keep responses engaging and educational`
              },
              { role: 'user', content: prompt }
            ],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000,
            top_p: 0.9
          });
          
          const result = completion.choices[0].message.content;
          console.log(`[AI] Got response from ${model}, length: ${result?.length || 0}`);
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
    console.log(`[AI] Processing query: "${query}"`);
    console.log(`[AI] Chat history length: ${chatHistory?.length || 0}`);
    
    const prompt = this.buildQueryPrompt({ query, problemData, chatHistory });
    const rawResponse = await this.callModel(prompt, { temperature: 0.7 });
    return this.parseAIResponse(rawResponse);
  }

  async generateHint(level, problemData) {
    const prompt = this.buildHintPrompt(level, problemData);
    const hint = await this.callModel(prompt, { temperature: 0.6, maxTokens: 300 });
    
    let cleanHint = hint.trim()
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/^\{\s*"hint":\s*"/i, '')
      .replace(/"\s*\}$/i, '');
    
    return cleanHint.substring(0, 500);
  }

  buildQueryPrompt({ query, problemData, chatHistory }) {
    // Build full conversation history for context
    let conversationHistory = '';
    if (chatHistory && chatHistory.length > 0) {
      conversationHistory = '\n\nCONVERSATION HISTORY (IMPORTANT - use this to understand context):\n';
      conversationHistory += '```\n';
      for (let i = 0; i < chatHistory.length; i++) {
        const msg = chatHistory[i];
        const role = msg.role === 'user' ? 'Student' : 'Mentor';
        conversationHistory += `${role}: ${msg.content}\n`;
      }
      conversationHistory += '```\n';
    }

    return `You are an expert DSA mentor helping a student solve a coding problem.

PROBLEM DETAILS:
Title: ${problemData?.title || 'Unknown'}
Difficulty: ${problemData?.difficulty || 'Unknown'}
Description: ${(problemData?.description || problemData?.fullProblemText || '').substring(0, 2000)}
Platform: ${problemData?.platform || 'Unknown'}

${conversationHistory}

STUDENT'S LATEST QUESTION: "${query}"

IMPORTANT INSTRUCTIONS:
1. READ THE CONVERSATION HISTORY above to understand what the student is asking for
2. If the student says "yes please", "share the code", "explain more", "yes explain", etc. - provide what they requested in your PREVIOUS response
3. If the student asks for code, provide actual code with explanations
4. If the student asks for pseudo-code, provide pseudo-code
5. Be conversational - respond directly to their question
6. Use markdown with emojis (💡, ⚡, 📊, 🎯, ⚠️)

Return ONLY valid JSON in this exact format:
{
  "reply": "Your detailed response that DIRECTLY answers the student's latest question based on conversation context",
  "approaches": [
    {
      "name": "Approach Name",
      "idea": "Brief description",
      "time": "O(...)",
      "space": "O(...)"
    }
  ]
}

EXAMPLE:
If conversation shows:
Student: "explain the frequency count approach"
Mentor: [explained frequency count]
Student: "share the pseudo code"

Then your response should provide the pseudo-code for frequency count.

Now respond to: "${query}"`;
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
      
      cleaned = cleaned.replace(/^```json\s*/i, '');
      cleaned = cleaned.replace(/^```\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/i, '');
      
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
          reply: parsed.reply || cleaned,
          approaches: Array.isArray(parsed.approaches) ? parsed.approaches : []
        };
      }
      
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