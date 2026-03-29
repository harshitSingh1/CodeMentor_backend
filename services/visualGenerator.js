class VisualGenerator {
  async generate(algorithm, data, type = 'flowchart') {
    return {
      type: 'text',
      description: this.getDescription(algorithm),
      steps: this.getSteps(algorithm),
      complexity: this.getComplexity(algorithm)
    };
  }

  getSteps(algorithm) {
    const steps = {
      'binary-search': [
        '1. Set low = 0, high = array.length - 1',
        '2. While low ≤ high:',
        '   a. mid = (low + high) // 2',
        '   b. If target == array[mid], return mid',
        '   c. If target < array[mid], high = mid - 1',
        '   d. Else low = mid + 1',
        '3. Return -1 (not found)'
      ],
      'bubble-sort': [
        '1. For i = 0 to n-1:',
        '   a. For j = 0 to n-i-1:',
        '      - If array[j] > array[j+1], swap them',
        '2. Array is sorted'
      ]
    };
    return steps[algorithm.toLowerCase()] || ['1. Understand the problem', '2. Choose appropriate data structures', '3. Implement solution', '4. Test edge cases'];
  }

  getDescription(algorithm) {
    const desc = {
      'binary-search': 'O(log n) search algorithm that repeatedly divides the search interval in half',
      'bubble-sort': 'O(n²) sorting algorithm that repeatedly steps through the list, comparing adjacent elements'
    };
    return desc[algorithm.toLowerCase()] || `${algorithm} algorithm visualization`;
  }

  getComplexity(algorithm) {
    const complexity = {
      'binary-search': 'Time: O(log n), Space: O(1)',
      'bubble-sort': 'Time: O(n²), Space: O(1)'
    };
    return complexity[algorithm.toLowerCase()] || 'Time: O(n), Space: O(n)';
  }
}

module.exports = new VisualGenerator();