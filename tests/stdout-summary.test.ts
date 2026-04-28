import { describe, it, expect } from 'vitest';
import { renderStdoutIssues } from '../src/stdout-summary';
import type { ExtractedIssue, JobStatusResponse } from '../src/types';

const richIssue: ExtractedIssue = {
  title: 'Login button does nothing',
  description: 'Clicking Sign In does not submit the form.',
  reproductionSteps: [{ text: 'Visit /login' }, { text: 'Click Sign In' }],
  severity: 'critical',
  suggestedLabels: ['bug', 'auth'],
  expectedBehavior: 'Form submits and redirects to /dashboard.',
  actualBehavior: 'Nothing happens.',
  affectedArea: 'Sign In button at /login',
  evidenceCitations: [],
  rootCause: {
    explanation: 'handleSubmit is not destructured in LoginPage.',
    confidence: 'high',
  },
  suggestedFix: 'Destructure handleSubmit in LoginPage and bind to the button.',
  codeReferences: [{ path: 'packages/web/src/pages/Login.tsx', symbol: 'LoginPage' }],
};

const job: JobStatusResponse = {
  id: 'job-abc',
  status: 'completed',
  url: 'https://example.com/login',
  description: 'Verify users can sign in.',
  jobUrl: 'https://qa-experiment.fly.dev/jobs/job-abc',
};

describe('renderStdoutIssues', () => {
  it('returns an empty array when there are no extracted issues', () => {
    expect(renderStdoutIssues([], job)).toEqual([]);
  });

  it('produces a per-issue header line', () => {
    const lines = renderStdoutIssues([richIssue, richIssue], job);
    const headers = lines.filter((l) => /Issue \d+\/\d+/.test(l));
    expect(headers.length).toBe(2);
    expect(headers[0]).toContain('Issue 1/2');
    expect(headers[1]).toContain('Issue 2/2');
  });

  it('includes the full body sections (Description, Suggested Fix, Code References) per issue', () => {
    const blob = renderStdoutIssues([richIssue], job).join('\n');
    expect(blob).toContain('## Description');
    expect(blob).toContain('## Suggested Fix');
    expect(blob).toContain('## Code References');
    expect(blob).toContain('Destructure handleSubmit');
    expect(blob).toContain('packages/web/src/pages/Login.tsx');
  });

  it('omits sections with missing fields cleanly', () => {
    const minimal: ExtractedIssue = {
      title: 'Header misaligned',
      description: 'Header shifts on Firefox.',
      reproductionSteps: [],
      severity: 'low',
      suggestedLabels: [],
      expectedBehavior: 'Header centered.',
      actualBehavior: 'Header shifted.',
      affectedArea: 'Header on /',
      evidenceCitations: [],
    };
    const blob = renderStdoutIssues([minimal], job).join('\n');
    expect(blob).not.toContain('## Suggested Fix');
    expect(blob).not.toContain('## Root Cause');
    expect(blob).not.toContain('## Code References');
    expect(blob).toContain('## Description');
  });
});
