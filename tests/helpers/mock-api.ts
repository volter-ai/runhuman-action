import { vi } from 'vitest';
import type { JobStatusResponse, CreateJobResponse } from '../../src/types';

export interface MockJobConfig {
  jobId: string;
  jobUrl?: string;
  status: 'completed' | 'error' | 'timeout' | 'abandoned';
  success?: boolean;
  costUsd?: number;
  durationSeconds?: number;
  explanation?: string;
  data?: Record<string, unknown>;
}

export class MockApiClient {
  private jobConfigs: Map<string, MockJobConfig> = new Map();
  private jobQueue: MockJobConfig[] = [];
  private createJobCalls: any[] = [];
  private statusCheckCalls: any[] = [];

  mockCreateJob(config: MockJobConfig): void {
    this.jobConfigs.set(config.jobId, config);
    this.jobQueue.push(config);
  }

  createMockFetch(): typeof global.fetch {
    return vi.fn(async (url: string, options?: RequestInit) => {
      const urlStr = url.toString();

      if (options?.method === 'POST' && urlStr.includes('/api/jobs') && !urlStr.includes('/status')) {
        const body = JSON.parse(options.body as string);
        this.createJobCalls.push({ url, body, timestamp: Date.now() });

        let config: MockJobConfig;

        if (this.jobQueue.length > 0) {
          config = this.jobQueue.shift()!;
        } else {
          config = {
            jobId: `job_${Date.now()}`,
            status: 'completed',
            success: true,
          };
          this.jobConfigs.set(config.jobId, config);
        }

        const response: CreateJobResponse = {
          jobId: config.jobId,
          message: 'Job created successfully',
        };

        return {
          ok: true,
          status: 200,
          json: async () => response,
        } as Response;
      }

      if (options?.method === 'GET' && urlStr.includes('/status')) {
        const jobId = urlStr.match(/\/jobs\/([^/]+)\/status/)?.[1];
        this.statusCheckCalls.push({ jobId, timestamp: Date.now() });

        if (!jobId) {
          return {
            ok: false,
            status: 404,
            text: async () => 'Job not found',
          } as Response;
        }

        const config = this.jobConfigs.get(jobId) || {
          jobId,
          status: 'completed',
          success: true,
        };

        const response: JobStatusResponse = {
          id: jobId,
          status: config.status,
          jobUrl: config.jobUrl,
          result: config.status === 'completed' ? {
            success: config.success ?? true,
            explanation: config.explanation || 'Test completed',
            data: config.data || {},
          } : undefined,
          error: config.status === 'error' ? 'Test error' : undefined,
          costUsd: config.costUsd ?? 1.5,
          testDurationSeconds: config.durationSeconds ?? 120,
        };

        return {
          ok: true,
          status: 200,
          json: async () => response,
        } as Response;
      }

      if (options?.method === 'POST' && urlStr.includes('/analyze-issue')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            isTestable: true,
            testUrl: 'https://example.com',
            testInstructions: 'Test the feature',
            outputSchema: {},
            confidence: 0.9,
          }),
        } as Response;
      }

      throw new Error(`Unmocked fetch: ${options?.method} ${url}`);
    }) as typeof global.fetch;
  }

  getCreateJobCalls(): any[] {
    return [...this.createJobCalls];
  }

  getStatusCheckCalls(): any[] {
    return [...this.statusCheckCalls];
  }

  reset(): void {
    this.jobConfigs.clear();
    this.jobQueue = [];
    this.createJobCalls = [];
    this.statusCheckCalls = [];
  }
}
