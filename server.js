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

const aiService = require('./services/aiService');
const codeAnalysis = require('./services/codeAnalysis');
const visualGenerator = require('./services/visualGenerator');

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), model: config.featherless.model });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { query, problemData, chatHistory } = req.body;
    const response = await aiService.processQuery({ query, problemData, chatHistory });
    
    let cleanReply = response.reply
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^\{\s*"reply":\s*"/i, '')
      .replace(/"\s*\}$/i, '');
    
    res.json({ success: true, reply: cleanReply, approaches: response.approaches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/hint', async (req, res) => {
  try {
    const { level, problemData } = req.body;
    const hint = await aiService.generateHint(level, problemData);
    res.json({ hint });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze-code', async (req, res) => {
  try {
    const { code, language } = req.body;
    const analysis = await codeAnalysis.analyze(code, language);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-visual', async (req, res) => {
  try {
    const { algorithm, data, type } = req.body;
    const visual = await visualGenerator.generate(algorithm, data, type);
    res.json(visual);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queue-status', (req, res) => {
  res.json(aiService.getQueueStatus());
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ CodeMentor backend running on port ${PORT}`);
  console.log(`🤖 Model: ${config.featherless.model}`);
});

server.timeout = 60000;