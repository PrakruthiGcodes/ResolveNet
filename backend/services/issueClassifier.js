/**
 * Text-based issue classifier.
 *
 * NOTE: This is a simple deterministic keyword/rule-based classifier for
 * Phase 4A. It is NOT a trained machine-learning model. It is intentionally
 * isolated behind the classifyIssue(text) interface so it can be swapped for
 * a real ML-based classifier later without changing any calling code.
 */

const RULES = [
  {
    issueType: 'pothole',
    keywords: ['pothole', 'pot hole', 'road crater', 'broken road', 'damaged road'],
  },
  {
    issueType: 'water_leakage',
    keywords: [
      'water leak',
      'leaking water',
      'water leaking',
      'pipe leak',
      'leaking pipe',
      'burst pipe',
      'water pipe',
    ],
  },
  {
    issueType: 'garbage',
    keywords: ['garbage', 'trash', 'rubbish', 'waste overflowing', 'overflowing garbage', 'overflowing bin'],
  },
  {
    issueType: 'streetlight',
    keywords: ['street light', 'streetlight', 'street lamp', 'lamp post'],
  },
];

const MATCH_CONFIDENCE = 0.95;
const DEFAULT_CONFIDENCE = 0.5;

const classifyIssue = (description) => {
  const text = (description || '').toLowerCase();

  for (const rule of RULES) {
    const matched = rule.keywords.some((keyword) => text.includes(keyword));
    if (matched) {
      return { issueType: rule.issueType, confidence: MATCH_CONFIDENCE };
    }
  }

  return { issueType: 'other', confidence: DEFAULT_CONFIDENCE };
};

module.exports = { classifyIssue };
