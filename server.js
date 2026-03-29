const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
require('dotenv').config();

if (!process.env.FEATHERLESS_API_KEY) {
  console.error('❌ FEATHERLESS_API_KEY not set in .env');
  process.exit(1);
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }));

// Add request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const aiService = require('./services/aiService');
const codeAnalysis = require('./services/codeAnalysis');
const visualGenerator = require('./services/visualGenerator');
const approachComparator = require('./services/approachComparator');

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(), 
    model: config.featherless.model,
    queue: aiService.getQueueStatus()
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { query, problemData, chatHistory } = req.body;
    console.log(`[CHAT] Query: "${query?.substring(0, 100)}"`);
    
    const response = await aiService.processQuery({ query, problemData, chatHistory });
    
    // Ensure we have a valid response
    if (!response.reply || response.reply.length < 10) {
      console.warn('[CHAT] Empty response from AI');
      response.reply = "I'm having trouble generating a response. Could you please rephrase your question?";
    }
    
    res.json({ 
      success: true, 
      reply: response.reply, 
      approaches: response.approaches || [] 
    });
  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      reply: "I encountered an error. Please try again in a moment."
    });
  }
});

app.post('/api/hint', async (req, res) => {
  try {
    const { level, problemData } = req.body;
    console.log(`[HINT] Level ${level} for ${problemData?.title}`);
    
    const hint = await aiService.generateHint(level, problemData);
    res.json({ hint });
  } catch (error) {
    console.error('[HINT] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/compare-approaches', async (req, res) => {
  try {
    const { problemData } = req.body;
    const comparisons = await approachComparator.compare(problemData);
    res.json({ comparisons });
  } catch (error) {
    console.error('[COMPARE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze-code', async (req, res) => {
  try {
    const { code, language } = req.body;
    const analysis = await codeAnalysis.analyze(code, language);
    res.json(analysis);
  } catch (error) {
    console.error('[ANALYZE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-visual', async (req, res) => {
  try {
    const { algorithm, data, type } = req.body;
    const visual = await visualGenerator.generate(algorithm, data, type);
    res.json(visual);
  } catch (error) {
    console.error('[VISUAL] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mistake-radar', async (req, res) => {
  try {
    const { code, userText, platform } = req.body;
    // Simple pattern matching for common mistakes
    const pitfalls = [];
    const text = (code || userText || '').toLowerCase();
    
    if (text.includes('for') && text.includes('for') && text.match(/for/g)?.length > 2) {
      pitfalls.push('Possible nested loops - check complexity');
    }
    if (text.includes('+') && text.match(/\+\s*[a-z]/i)) {
      pitfalls.push('Off-by-one - check array indices');
    }
    if (text.includes('==') && !text.includes('===')) {
      pitfalls.push('Using == instead of === (type coercion)');
    }
    if (text.includes('return') && text.split('return').length > 3) {
      pitfalls.push('Multiple return points - consider refactoring');
    }
    
    res.json({ pitfalls: pitfalls.slice(0, 5) });
  } catch (error) {
    console.error('[MISTAKE] Error:', error);
    res.json({ pitfalls: [] });
  }
});

app.post('/api/session-summary', async (req, res) => {
  try {
    const { problem, chatHistory, hintsRevealed, approaches, timeElapsed } = req.body;
    
    const summary = `# 📝 DSA Session Summary

## Problem
**${problem?.title || 'Unknown'}** (${problem?.difficulty || 'Unknown difficulty'})
Platform: ${problem?.platform || 'Unknown'}

## Session Stats
- ⏱️ Time spent: ${Math.floor(timeElapsed / 60)} minutes
- 💡 Hints used: ${hintsRevealed}/4
- 💬 Messages exchanged: ${chatHistory?.length || 0}
- 🎯 Approaches discussed: ${approaches?.length || 0}

## Key Discussion Points
${(chatHistory || []).slice(-5).map(m => `- **${m.role === 'user' ? 'You' : 'Mentor'}**: ${m.content.substring(0, 150)}`).join('\n')}

## Approaches Covered
${(approaches || []).map(a => `- **${a.name}**: ${a.idea || ''} (Time: ${a.time || 'N/A'}, Space: ${a.space || 'N/A'})`).join('\n') || '- No approaches discussed'}

## Next Steps
- Review the time/space complexity trade-offs
- Practice similar problems on the same platform
- Try to implement the solution without looking at hints

---
*Generated by CodeMentor AI - Keep practicing! 🚀*`;

    res.json({ summary });
  } catch (error) {
    console.error('[SUMMARY] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stuck-nudge', async (req, res) => {
  try {
    const { minutes, problemData } = req.body;
    const nudges = [
      `Have you considered all the edge cases? What about empty input or single element?`,
      `What data structure would give you O(1) lookup time?`,
      `Try breaking down the problem into smaller subproblems.`,
      `What happens if you sort the array first? Does that help?`,
      `Can you solve it with two pointers moving from opposite ends?`
    ];
    const nudge = nudges[Math.floor(Math.random() * nudges.length)];
    res.json({ nudge });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ CodeMentor backend running on port ${PORT}`);
  console.log(`🤖 Model: ${config.featherless.model}`);
  console.log(`🌐 Backend URL: https://codementor-backend-ocuk.onrender.com`);
});

server.timeout = 60000;