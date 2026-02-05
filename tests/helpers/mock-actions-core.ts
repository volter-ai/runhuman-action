import { vi } from 'vitest';

export interface MockedOutputs {
  [key: string]: string;
}

export class MockActionsCore {
  outputs: MockedOutputs = {};
  private infoLogs: string[] = [];
  private errorLogs: string[] = [];
  private warnings: string[] = [];
  private failureMessage: string | null = null;

  setOutput(key: string, value: string): void {
    this.outputs[key] = value;
  }

  info(message: string): void {
    this.infoLogs.push(message);
  }

  error(message: string): void {
    this.errorLogs.push(message);
  }

  warning(message: string): void {
    this.warnings.push(message);
  }

  setFailed(message: string): void {
    this.failureMessage = message;
  }

  debug(message: string): void {
    // No-op for tests
  }

  getInput(name: string): string {
    return '';
  }

  getOutput(key: string): string | undefined {
    return this.outputs[key];
  }

  getOutputAsJson<T>(key: string): T {
    const value = this.outputs[key];
    return value ? JSON.parse(value) : undefined;
  }

  getInfoLogs(): string[] {
    return [...this.infoLogs];
  }

  getErrors(): string[] {
    return [...this.errorLogs];
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  getFailureMessage(): string | null {
    return this.failureMessage;
  }

  reset(): void {
    this.outputs = {};
    this.infoLogs = [];
    this.errorLogs = [];
    this.warnings = [];
    this.failureMessage = null;
  }
}
