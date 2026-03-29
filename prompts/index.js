module.exports = {
  buildQueryPrompt: ({ query, problemData, chatHistory }) => `
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
  "reply": "Your response with markdown and emojis (🎯💡⚡📊⚠️)",
  "approaches": [
    {"name": "Approach name", "idea": "1 sentence", "time": "O(...)", "space": "O(...)"}
  ]
}

Return ONLY valid JSON.`,

  buildHintPrompt: (level, problemData) => {
    const levels = { 1: 'Intuition', 2: 'Approach Outline', 3: 'Key Observation' };
    return `
Provide a LEVEL ${level} hint (${levels[level]}) for: ${problemData?.title || 'Unknown'}

Description: ${(problemData?.description || '').substring(0, 500)}

RULES: NO code, be concise (1-3 sentences), guide thinking.

Return ONLY the hint text.`;
  }
};