import type { TemplateConfig, ScreenSizeConfig } from './types';
/**
 * Load and parse a local template file
 *
 * Template format:
 * - YAML frontmatter for configuration (name, duration, screen_size, url)
 * - Markdown body for test description
 * - Optional "## Results" section with MDForm syntax for outputSchema
 */
export declare function loadTemplateFile(filePath: string): TemplateConfig;
/**
 * Merge template config with action inputs
 * Action inputs take precedence over template values
 */
export declare function mergeTemplateWithInputs(template: TemplateConfig, inputs: {
    url?: string;
    description?: string;
    outputSchema?: Record<string, unknown>;
    targetDurationMinutes?: number;
    screenSize?: ScreenSizeConfig;
}): {
    url: string;
    description: string;
    outputSchema?: Record<string, unknown>;
    targetDurationMinutes?: number;
    screenSize?: ScreenSizeConfig;
};
