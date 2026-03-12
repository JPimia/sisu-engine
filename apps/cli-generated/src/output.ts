/**
 * Output helpers for the generated CLI.
 * Generated from: openapi/sisu-v1.yaml
 */

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const fmt = (row: string[]) =>
    row.map((cell, i) => (cell ?? '').padEnd(widths[i] ?? 0)).join('  ');
  console.log(fmt(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));
}
