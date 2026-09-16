/**
 * Initial performance budgets (docs/performance.md). They are targets to validate on real
 * devices, not guarantees. The benchmark report marks each metric pass/fail against them.
 */
export interface Budget {
  id: string;
  label: string;
  unit: 'ms' | 'MB' | 'KB' | 'fps';
  /** Lower is better unless `higherIsBetter`. */
  mobile: number;
  desktop: number;
  higherIsBetter?: boolean;
}

export const PERFORMANCE_BUDGETS: readonly Budget[] = [
  { id: 'startup', label: 'Launch to interactive home', unit: 'ms', mobile: 2500, desktop: 1000 },
  { id: 'projectLoad', label: 'Open demo project', unit: 'ms', mobile: 2000, desktop: 500 },
  { id: 'sceneBuild', label: 'Build scene in viewport', unit: 'ms', mobile: 1500, desktop: 400 },
  { id: 'assetImport', label: 'Import + analyse sample model', unit: 'ms', mobile: 3000, desktop: 800 },
  { id: 'frameTimeP95', label: 'Play-mode frame time (p95)', unit: 'ms', mobile: 33.4, desktop: 16.8 },
  { id: 'fps', label: 'Play-mode average FPS', unit: 'fps', mobile: 28, desktop: 55, higherIsBetter: true },
  { id: 'jsHeap', label: 'JS heap with demo open', unit: 'MB', mobile: 150, desktop: 300 },
  { id: 'idleFrames', label: 'Frames rendered while editor idle (5 s)', unit: 'fps', mobile: 0, desktop: 0 },
];

export interface BudgetResult {
  budget: Budget;
  value: number | null;
  limit: number;
  pass: boolean | null;
}

export function evaluateBudgets(values: Record<string, number | null>, isMobile: boolean): BudgetResult[] {
  return PERFORMANCE_BUDGETS.map((budget) => {
    const value = values[budget.id] ?? null;
    const limit = isMobile ? budget.mobile : budget.desktop;
    const pass = value === null ? null : budget.higherIsBetter ? value >= limit : value <= limit;
    return { budget, value, limit, pass };
  });
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}
