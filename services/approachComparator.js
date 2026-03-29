// services\approachComparator.js
const aiService = require('./aiService');

class ApproachComparator {
  async compare(problemData) {
    const prompt = `
      Analyze this DSA problem and provide 3 different approaches:
      
      Problem: ${problemData.title}
      Description: ${problemData.description || problemData.fullProblemText}
      
      For each approach, provide:
      1. Name (descriptive)
      2. Core idea (1-2 sentences)
      3. Time complexity
      4. Space complexity
      5. When to use (scenarios where this approach shines)
      6. Common pitfalls
      7. Code example (pseudo-code, no complete solution)
      
      Return as JSON array with these fields.
    `;
    
    const response = await aiService.callModel(prompt, { temperature: 0.7, maxTokens: 2000 });
    
    try {
      const approaches = JSON.parse(response);
      return this.enrichApproaches(approaches);
    } catch {
      return this.parseApproaches(response);
    }
  }

  enrichApproaches(approaches) {
    return approaches.map(approach => ({
      ...approach,
      visualization: this.getApproachVisualization(approach.name),
      complexityAnalysis: this.analyzeComplexityTradeoffs(approach),
      codeTemplate: this.generateCodeTemplate(approach)
    }));
  }

  parseApproaches(text) {
    const approaches = [];
    const sections = text.split(/\d+\./);
    
    for (const section of sections) {
      if (section.trim()) {
        const lines = section.split('\n');
        approaches.push({
          name: lines[0]?.trim() || 'Approach',
          idea: lines[1]?.trim() || '',
          timeComplexity: this.extractComplexity(lines, 'time'),
          spaceComplexity: this.extractComplexity(lines, 'space'),
          whenToUse: this.extractWhenToUse(lines)
        });
      }
    }
    
    return approaches;
  }

  extractComplexity(lines, type) {
    const pattern = type === 'time' ? /time\s*complexity:\s*([^,\n]+)/i : /space\s*complexity:\s*([^,\n]+)/i;
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) return match[1].trim();
    }
    return type === 'time' ? 'O(n)' : 'O(1)';
  }

  extractWhenToUse(lines) {
    for (const line of lines) {
      if (line.match(/when\s*to\s*use|best\s*for|use\s*when/i)) {
        return line.replace(/when\s*to\s*use:?\s*/i, '').trim();
      }
    }
    return 'General purpose';
  }

  getApproachVisualization(name) {
    const visualizations = {
      'brute force': 'Simple iteration over all possibilities',
      'two pointers': 'Use two pointers moving from ends or same direction',
      'sliding window': 'Expand and contract window based on conditions',
      'dynamic programming': 'Build solution from subproblems using memoization',
      'greedy': 'Make locally optimal choices at each step',
      'divide and conquer': 'Split problem, solve recursively, combine results'
    };
    
    for (const [key, value] of Object.entries(visualizations)) {
      if (name.toLowerCase().includes(key)) {
        return value;
      }
    }
    
    return 'Custom approach visualization';
  }

  analyzeComplexityTradeoffs(approach) {
    const time = approach.timeComplexity || 'O(n)';
    const space = approach.spaceComplexity || 'O(n)';
    
    let analysis = '';
    
    if (time.includes('n²') || time.includes('n^2')) {
      analysis += '⚠️ May be slow for large inputs (>10^4). ';
    } else if (time.includes('n log n')) {
      analysis += '✅ Efficient for most practical inputs. ';
    } else if (time.includes('n')) {
      analysis += '✅ Linear time - good performance. ';
    }
    
    if (space.includes('n²') || space.includes('n^2')) {
      analysis += '⚠️ High memory usage. ';
    } else if (space.includes('n')) {
      analysis += '📊 Linear space usage. ';
    } else if (space.includes('1') || space.includes('constant')) {
      analysis += '✅ Constant space - memory efficient. ';
    }
    
    return analysis || 'Balanced approach for most scenarios.';
  }

  generateCodeTemplate(approach) {
    const templates = {
      'two pointers': `
function twoPointersSolution(arr, target) {
  let left = 0;
  let right = arr.length - 1;
  
  while (left < right) {
    // Your logic here
    const sum = arr[left] + arr[right];
    
    if (sum === target) {
      return [left, right];
    } else if (sum < target) {
      left++;
    } else {
      right--;
    }
  }
  
  return [-1, -1];
}`,
      'sliding window': `
function slidingWindowSolution(arr, k) {
  let windowSum = 0;
  let maxSum = -Infinity;
  
  for (let i = 0; i < arr.length; i++) {
    windowSum += arr[i];
    
    if (i >= k - 1) {
      maxSum = Math.max(maxSum, windowSum);
      windowSum -= arr[i - (k - 1)];
    }
  }
  
  return maxSum;
}`,
      'dynamic programming': `
function dpSolution(nums) {
  const dp = new Array(nums.length).fill(0);
  dp[0] = nums[0];
  
  for (let i = 1; i < nums.length; i++) {
    // Your DP transition here
    dp[i] = Math.max(nums[i], dp[i - 1] + nums[i]);
  }
  
  return Math.max(...dp);
}`
    };
    
    for (const [key, template] of Object.entries(templates)) {
      if (approach.name.toLowerCase().includes(key)) {
        return template;
      }
    }
    
    return `function ${approach.name.toLowerCase().replace(/\s+/g, '')}(input) {
  // Implement ${approach.name} approach
  // ${approach.idea}
  
  // TODO: Add your implementation
  return result;
}`;
  }
}

module.exports = new ApproachComparator();