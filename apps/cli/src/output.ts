/**
 * Output helpers: table printing + JSON mode.
 */

export function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export function outputTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0);
    return Math.max(h.length, maxData);
  });

  const line = colWidths.map((w) => '-'.repeat(w)).join('  ');
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i] ?? 0)).join('  ');

  console.log(headerRow);
  console.log(line);
  for (const row of rows) {
    console.log(row.map((cell, i) => (cell ?? '').padEnd(colWidths[i] ?? 0)).join('  '));
  }
}

export function outputError(message: string): void {
  console.error(`Error: ${message}`);
}
