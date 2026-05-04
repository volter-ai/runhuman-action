import * as github from '@actions/github';
import type { RunhumanJobResult, TestOutcome } from './types';
type Octokit = ReturnType<typeof github.getOctokit>;
export interface DigestRenderMetadata {
    owner: string;
    repo: string;
    commitSha?: string;
    runId: number;
    runNumber: number;
    timestamp: string;
}
export declare function renderDigestMarkdown(result: RunhumanJobResult, outcome: TestOutcome, metadata: DigestRenderMetadata): string;
export interface PostPrDigestCommentParams {
    octokit: Octokit;
    owner: string;
    repo: string;
    prNumber: number;
    result: RunhumanJobResult;
    outcome: TestOutcome;
    commitSha?: string;
    runId: number;
    runNumber: number;
}
export declare function postPrDigestComment(params: PostPrDigestCommentParams): Promise<void>;
export {};
