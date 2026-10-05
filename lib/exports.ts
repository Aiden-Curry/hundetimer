/** Fail rather than silently returning a truncated or partial export. */
export async function allExportRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error('Kunne ikke hente alle eksportdata. Prøv igjen senere.');
    result.push(...(data || []));
    if (!data || data.length < size) return result;
  }
}

export function csvCell(value: unknown) {
  let text = String(value ?? '').replace(/\u0000/g, '');
  // Quoting alone does not prevent spreadsheet formula execution.
  if (typeof value !== 'number' && (/^\s*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvDocument(rows: unknown[][], delimiter: ',' | ';' = ';') {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(delimiter)).join('\r\n') + '\r\n';
}

export function downloadHeaders(type: string, filename: string) {
  return {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}
