import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockActionsCore } from '../helpers/mock-actions-core';
import { MockApiClient } from '../helpers/mock-api';
import { createMockInputs } from '../helpers/test-utils';
import { createMockGitHubContext, createMockOctokit } from '../helpers/mock-actions-github';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { runTestWithDescription } from '../../src/runner';
import type { ActionOutputs } from '../../src/types';

let mockCore: MockActionsCore;
let mockApi: MockApiClient;
let originalFetch: typeof global.fetch;

describe('Action Job Outputs Integration Tests', () => {
  beforeEach(() => {
    mockCore = new MockActionsCore();
    mockApi = new MockApiClient();
    originalFetch = global.fetch;
    global.fetch = mockApi.createMockFetch();

    vi.spyOn(core, 'setOutput').mockImplementation((key: string, value: string) => mockCore.setOutput(key, value));
    vi.spyOn(core, 'info').mockImplementation((msg: string) => mockCore.info(msg));
    vi.spyOn(core, 'error').mockImplementation((msg: string) => mockCore.error(msg));
    vi.spyOn(core, 'warning').mockImplementation((msg: string) => mockCore.warning(msg));
    vi.spyOn(core, 'setFailed').mockImplementation((msg: string) => mockCore.setFailed(msg));
    vi.spyOn(core, 'debug').mockImplementation((msg: string) => mockCore.debug(msg));

    Object.defineProperty(github, 'context', {
      value: createMockGitHubContext(),
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockCore.reset();
    mockApi.reset();
    vi.restoreAllMocks();
  });

  describe('Single job with description', () => {
    it('should return job ID and URL for description-only test', async () => {
      const jobId = 'job_12345';
      const jobUrl = 'https://runhuman.com/dashboard/project-123/jobs/job_12345';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'completed',
        success: true,
        costUsd: 2.5,
        durationSeconds: 180,
      });

      const inputs = createMockInputs({
        description: 'Test the login flow',
        issueNumbers: [],
        prNumbers: [],
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('completed');
      expect(result.success).toBe(true);
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
      expect(result.costUsd).toBe(2.5);
      expect(result.durationSeconds).toBe(180);
    });

    it('should return job ID with undefined URL when API does not provide jobUrl', async () => {
      const jobId = 'job_67890';

      mockApi.mockCreateJob({
        jobId,
        status: 'completed',
        success: true,
      });

      const inputs = createMockInputs({
        description: 'Test checkout',
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('completed');
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBeUndefined();
    });
  });

  describe('Timeout case', () => {
    it('should return job ID and URL even when test times out', async () => {
      const jobId = 'job_timeout_001';
      const jobUrl = 'https://runhuman.com/dashboard/project-123/jobs/job_timeout_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'completed',
        success: false,
        explanation: 'Test timed out waiting for completion',
      });

      const inputs = createMockInputs({
        description: 'Test that completes but fails',
        failOnTimeout: false,
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('completed');
      expect(result.success).toBe(false);
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
    });
  });

  describe('Error case', () => {
    it('should return job ID and URL even when test errors', async () => {
      const jobId = 'job_error_001';
      const jobUrl = 'https://runhuman.com/dashboard/project-123/jobs/job_error_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'error',
      });

      const inputs = createMockInputs({
        description: 'Test that errors',
        failOnError: false,
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('error');
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
    });
  });

  describe('Abandoned case', () => {
    it('should return job ID and URL when test is abandoned', async () => {
      const jobId = 'job_abandoned_001';
      const jobUrl = 'https://runhuman.com/dashboard/project-123/jobs/job_abandoned_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'abandoned',
      });

      const inputs = createMockInputs({
        description: 'Test that gets abandoned',
        failOnError: false,
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('abandoned');
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
    });
  });

  describe('Failed test case', () => {
    it('should return job ID and URL when test completes but fails', async () => {
      const jobId = 'job_failed_001';
      const jobUrl = 'https://runhuman.com/dashboard/project-123/jobs/job_failed_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'completed',
        success: false,
        explanation: 'Login button not found',
      });

      const inputs = createMockInputs({
        description: 'Test login flow',
        failOnFailure: false,
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('completed');
      expect(result.success).toBe(false);
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
      expect(result.explanation).toBe('Login button not found');
    });
  });

  describe('Passed test case', () => {
    it('should return job ID and URL when test passes successfully', async () => {
      const jobId = 'job_passed_001';
      const jobUrl = 'https://runhuman.com/dashboard/project-123/jobs/job_passed_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'completed',
        success: true,
        explanation: 'All tests passed',
        data: { testResults: 'success' },
      });

      const inputs = createMockInputs({
        description: 'Test full checkout flow',
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('completed');
      expect(result.success).toBe(true);
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
      expect(result.explanation).toBe('All tests passed');
      expect(result.data).toEqual({ testResults: 'success' });
    });
  });

  describe('Missing jobUrl from API', () => {
    it('should handle missing jobUrl gracefully', async () => {
      const jobId = 'job_no_url_001';

      mockApi.mockCreateJob({
        jobId,
        status: 'completed',
        success: true,
      });

      const inputs = createMockInputs({
        description: 'Test without URL',
      });

      const result = await runTestWithDescription(inputs);

      expect(result.status).toBe('completed');
      expect(result.success).toBe(true);
      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBeUndefined();
    });
  });

  describe('API response validation', () => {
    it('should capture jobUrl from finalStatus after polling', async () => {
      const jobId = 'job_validate_001';
      const jobUrl = 'https://runhuman.com/dashboard/test-project/jobs/job_validate_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'completed',
        success: true,
      });

      const inputs = createMockInputs({
        description: 'Validate API response',
      });

      const result = await runTestWithDescription(inputs);

      expect((result as any).jobUrl).toBe(jobUrl);
    });
  });

  describe('Multiple sequential tests', () => {
    it('should return different job IDs for sequential tests', async () => {
      const jobId1 = 'job_seq_001';
      const jobId2 = 'job_seq_002';
      const jobUrl1 = 'https://runhuman.com/dashboard/project/jobs/job_seq_001';
      const jobUrl2 = 'https://runhuman.com/dashboard/project/jobs/job_seq_002';

      mockApi.mockCreateJob({
        jobId: jobId1,
        jobUrl: jobUrl1,
        status: 'completed',
        success: true,
      });

      const inputs1 = createMockInputs({
        description: 'First test',
      });

      const result1 = await runTestWithDescription(inputs1);

      expect((result1 as any).jobId).toBe(jobId1);
      expect((result1 as any).jobUrl).toBe(jobUrl1);

      mockApi.mockCreateJob({
        jobId: jobId2,
        jobUrl: jobUrl2,
        status: 'completed',
        success: true,
      });

      const inputs2 = createMockInputs({
        description: 'Second test',
      });

      const result2 = await runTestWithDescription(inputs2);

      expect((result2 as any).jobId).toBe(jobId2);
      expect((result2 as any).jobUrl).toBe(jobUrl2);
    });
  });

  describe('Cost and duration tracking', () => {
    it('should include cost and duration with job data', async () => {
      const jobId = 'job_metrics_001';
      const jobUrl = 'https://runhuman.com/dashboard/project/jobs/job_metrics_001';

      mockApi.mockCreateJob({
        jobId,
        jobUrl,
        status: 'completed',
        success: true,
        costUsd: 5.75,
        durationSeconds: 350,
      });

      const inputs = createMockInputs({
        description: 'Test with metrics',
      });

      const result = await runTestWithDescription(inputs);

      expect((result as any).jobId).toBe(jobId);
      expect((result as any).jobUrl).toBe(jobUrl);
      expect(result.costUsd).toBe(5.75);
      expect(result.durationSeconds).toBe(350);
    });
  });
});
