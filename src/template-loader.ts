import * as fs from 'fs';
import * as core from '@actions/core';
import matter from 'gray-matter';
import { parseMDFormToSchema } from '@runhuman/shared';
import type { TemplateConfig, ScreenSizeConfig } from './types';

/**
 * YAML frontmatter fields supported in template files
 */
interface TemplateFrontmatter {
  name?: string;
  duration?: number;
  screen_size?: string | { width: number; height: number };
  url?: string;
  allow_extension?: boolean;
  max_extension?: number;
}

/**
 * Load and parse a local template file
 *
 * Template format:
 * - YAML frontmatter for configuration (name, duration, screen_size, url)
 * - Markdown body for test description
 * - Optional "## Results" section with MDForm syntax for outputSchema
 */
export function loadTemplateFile(filePath: string): TemplateConfig {
  core.info(`Loading template from: ${filePath}`);

  // Read file content
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse frontmatter and content
  const { data: frontmatter, content: body } = matter(content) as {
    data: TemplateFrontmatter;
    content: string;
  };

  // Split body into description and results section
  const [description, resultsSection] = splitContent(body);

  // Parse MDForm in results section to get outputSchema
  const outputSchema = resultsSection
    ? parseMDFormToSchema(resultsSection)
    : undefined;

  // Build template config
  const config: TemplateConfig = {
    name: frontmatter.name,
    url: frontmatter.url,
    description: description.trim() || undefined,
    outputSchema: outputSchema && Object.keys(outputSchema).length > 0 ? outputSchema : undefined,
    targetDurationMinutes: frontmatter.duration,
    screenSize: parseScreenSize(frontmatter.screen_size),
    allowDurationExtension: frontmatter.allow_extension,
    maxExtensionMinutes: frontmatter.max_extension,
  };

  core.info(`Loaded template: ${config.name || '(unnamed)'}`);
  if (config.description) {
    core.debug(`Description: ${config.description.substring(0, 100)}...`);
  }
  if (config.outputSchema) {
    core.debug(`OutputSchema fields: ${Object.keys(config.outputSchema).join(', ')}`);
  }

  return config;
}

/**
 * Split markdown content into description and results section
 */
function splitContent(content: string): [string, string | null] {
  // Look for "## Results" section (case-insensitive)
  const resultsMatch = content.match(/^##\s+Results\s*$/im);

  if (!resultsMatch || resultsMatch.index === undefined) {
    return [content, null];
  }

  const splitIndex = resultsMatch.index;
  const description = content.slice(0, splitIndex);
  const resultsSection = content.slice(splitIndex + resultsMatch[0].length);

  return [description, resultsSection];
}

/**
 * Parse screen size from frontmatter value
 */
function parseScreenSize(
  value: string | { width: number; height: number } | undefined
): ScreenSizeConfig | undefined {
  if (!value) return undefined;

  if (typeof value === 'string') {
    // Validate preset name
    if (['desktop', 'laptop', 'tablet', 'mobile'].includes(value)) {
      return value as 'desktop' | 'laptop' | 'tablet' | 'mobile';
    }
    core.warning(`Invalid screen_size preset "${value}", ignoring`);
    return undefined;
  }

  // Custom dimensions
  if (typeof value === 'object' && 'width' in value && 'height' in value) {
    return { width: value.width, height: value.height };
  }

  return undefined;
}

/**
 * Merge template config with action inputs
 * Action inputs take precedence over template values
 */
export function mergeTemplateWithInputs(
  template: TemplateConfig,
  inputs: {
    url?: string;
    description?: string;
    outputSchema?: Record<string, unknown>;
    targetDurationMinutes?: number;
    screenSize?: ScreenSizeConfig;
  }
): {
  url: string;
  description: string;
  outputSchema?: Record<string, unknown>;
  targetDurationMinutes?: number;
  screenSize?: ScreenSizeConfig;
} {
  // Inputs override template values
  const url = inputs.url || template.url;
  const description = inputs.description || template.description;

  if (!url) {
    throw new Error('URL is required - provide via url input or template');
  }
  if (!description) {
    throw new Error('Description is required - provide via description input or template');
  }

  return {
    url,
    description,
    outputSchema: inputs.outputSchema || template.outputSchema,
    targetDurationMinutes: inputs.targetDurationMinutes ?? template.targetDurationMinutes,
    screenSize: inputs.screenSize || template.screenSize,
  };
}
