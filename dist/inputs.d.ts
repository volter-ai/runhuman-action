import type { ActionInputs } from './types';
/**
 * Parse a string that could be either JSON array or comma-separated values
 * into an array of numbers.
 */
export declare function parseNumberList(input: string): number[];
/**
 * Parse a string that could be either JSON array or comma-separated values
 * into an array of strings.
 */
export declare function parseStringList(input: string): string[];
/**
 * Parse all action inputs from GitHub Actions context.
 */
export declare function parseInputs(): ActionInputs;
