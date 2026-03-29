class CodeAnalysis {
  async analyze(code, language = 'javascript') {
    return {
      timeComplexity: this.analyzeComplexity(code),
      spaceComplexity: this.estimateSpaceComplexity(code),
      patterns: this.detectPatterns(code),
      suggestions: this.getSuggestions(code)
    };
  }

  analyzeComplexity(code) {
    let loops = 0, nested = 0, indent = 0;
    const lines = code.split('\n');
    
    for (const line of lines) {
      if (line.includes('for') || line.includes('while')) {
        loops++;
        const currentIndent = line.match(/^\s*/)[0].length;
        if (currentIndent > indent) nested++;
        indent = currentIndent;
      } else if (line.includes('}')) {
        indent = Math.max(0, indent - 2);
      }
    }
    
    if (loops === 0) return 'O(1) - Constant';
    if (loops === 1 && nested === 0) return 'O(n) - Linear';
    if (nested === 1) return 'O(n²) - Quadratic';
    return `O(n^${nested + 1}) - Polynomial`;
  }

  estimateSpaceComplexity(code) {
    const structures = ['new Map', 'new Set', 'new Array', '[]', '{}'];
    if (structures.some(s => code.includes(s))) return 'O(n) - Linear space';
    
    const vars = (code.match(/let|const|var/g) || []).length;
    if (vars > 10) return 'O(n) - Linear space';
    if (vars > 5) return 'O(1) to O(n)';
    return 'O(1) - Constant space';
  }

  detectPatterns(code) {
    const patterns = [];
    if (code.includes('Map') || code.includes('Set')) patterns.push('📚 Hash Map/Set');
    if (code.includes('stack') || (code.includes('push') && code.includes('pop'))) patterns.push('📚 Stack');
    if (code.includes('queue') || (code.includes('shift') && code.includes('push'))) patterns.push('📚 Queue');
    if (code.includes('async') || code.includes('Promise')) patterns.push('⚡ Async/Await');
    return patterns;
  }

  getSuggestions(code) {
    const suggestions = [];
    if ((code.match(/for/g) || []).length > 1) {
      suggestions.push('Consider reducing nested loops for better performance');
    }
    if (code.split('\n').length > 30) {
      suggestions.push('Break down into smaller functions for readability');
    }
    if (!code.includes('//') && !code.includes('/*')) {
      suggestions.push('Add comments to explain complex logic');
    }
    return suggestions;
  }
}

module.exports = new CodeAnalysis();