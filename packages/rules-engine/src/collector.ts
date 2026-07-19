import type { Todo, Violation } from '@rtw/shared';

/** Accumulates rule outcomes during a validation pass. */
export class Out {
  violations: Violation[] = [];
  warnings: Violation[] = [];
  todos: Todo[] = [];
  assumptions: string[] = [];
  /** true once a monotone rule (unrecoverable by extension) is violated. */
  monotoneViolated = false;

  violate(ruleId: string, message: string, segments: number[] = [], opts?: { monotone?: boolean }) {
    this.violations.push({ ruleId, message, segments });
    if (opts?.monotone !== false) this.monotoneViolated = true;
  }

  warn(ruleId: string, message: string, segments: number[] = []) {
    this.warnings.push({ ruleId, message, segments });
  }

  todo(ruleId: string, message: string, done: boolean) {
    this.todos.push({ ruleId, message, done });
  }

  assume(message: string) {
    if (!this.assumptions.includes(message)) this.assumptions.push(message);
  }
}
