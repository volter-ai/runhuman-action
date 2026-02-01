import * as core from '@actions/core';
import type { Issue } from './types';

/**
 * Keywords that suggest an issue is NOT testable by a human tester.
 */
const NON_TESTABLE_KEYWORDS = [
  'refactor',
  'cleanup',
  'documentation',
  'docs',
  'typo',
  'readme',
  'changelog',
  'ci/cd',
  'pipeline',
  'dependency',
  'dependencies',
  'upgrade',
  'bump',
  'version',
  'security',
  'vulnerability',
  'cve',
  'backend only',
  'backend-only',
  'internal',
  'infrastructure',
  'devops',
  'deployment',
  'config',
  'configuration',
];

/**
 * Keywords that suggest an issue IS testable by a human tester.
 */
const TESTABLE_KEYWORDS = [
  'ui',
  'button',
  'click',
  'form',
  'input',
  'modal',
  'dialog',
  'page',
  'screen',
  'display',
  'render',
  'layout',
  'style',
  'css',
  'responsive',
  'mobile',
  'desktop',
  'user flow',
  'workflow',
  'navigation',
  'redirect',
  'login',
  'signup',
  'checkout',
  'cart',
  'error message',
  'validation',
  'accessibility',
  'a11y',
  'visual',
  'animation',
  'hover',
  'scroll',
  'drag',
  'drop',
];

/**
 * Labels that indicate an issue should be tested.
 */
const TESTABLE_LABELS = [
  'bug',
  'ui',
  'ux',
  'frontend',
  'visual',
  'accessibility',
  'qa',
  'needs-testing',
  'stage:qa',
];

/**
 * Labels that indicate an issue should NOT be tested.
 */
const NON_TESTABLE_LABELS = [
  'documentation',
  'docs',
  'backend',
  'infrastructure',
  'ci',
  'devops',
  'refactor',
  'tech-debt',
  'internal',
  'wontfix',
  'duplicate',
  'invalid',
];

export interface TestabilityResult {
  isTestable: boolean;
  reason: string;
}

/**
 * Analyze an issue to determine if it can be tested by a human tester.
 * This uses simple heuristics. For more accurate analysis, the Runhuman API
 * can be used to perform AI-powered testability analysis.
 */
export function analyzeTestability(issue: Issue): TestabilityResult {
  const text = `${issue.title} ${issue.body}`.toLowerCase();
  const labels = issue.labels.map(l => l.toLowerCase());

  // Check labels first (most reliable signal)
  for (const label of labels) {
    if (NON_TESTABLE_LABELS.some(ntl => label.includes(ntl))) {
      return {
        isTestable: false,
        reason: `Issue has label suggesting it's not testable: ${label}`,
      };
    }
  }

  for (const label of labels) {
    if (TESTABLE_LABELS.some(tl => label.includes(tl))) {
      return {
        isTestable: true,
        reason: `Issue has label suggesting it's testable: ${label}`,
      };
    }
  }

  // Check for non-testable keywords
  for (const keyword of NON_TESTABLE_KEYWORDS) {
    if (text.includes(keyword)) {
      return {
        isTestable: false,
        reason: `Issue contains keyword suggesting it's not testable: ${keyword}`,
      };
    }
  }

  // Check for testable keywords
  for (const keyword of TESTABLE_KEYWORDS) {
    if (text.includes(keyword)) {
      return {
        isTestable: true,
        reason: `Issue contains keyword suggesting it's testable: ${keyword}`,
      };
    }
  }

  // Default: assume testable (better to test than to skip)
  return {
    isTestable: true,
    reason: 'No strong signals found, defaulting to testable',
  };
}

/**
 * Filter issues to only those that are testable.
 */
export function filterTestableIssues(issues: Issue[]): {
  testable: Issue[];
  notTestable: Array<{ issue: Issue; reason: string }>;
} {
  const testable: Issue[] = [];
  const notTestable: Array<{ issue: Issue; reason: string }> = [];

  for (const issue of issues) {
    const result = analyzeTestability(issue);
    if (result.isTestable) {
      core.info(`Issue #${issue.number} is testable: ${result.reason}`);
      testable.push(issue);
    } else {
      core.info(`Issue #${issue.number} is NOT testable: ${result.reason}`);
      notTestable.push({ issue, reason: result.reason });
    }
  }

  return { testable, notTestable };
}
