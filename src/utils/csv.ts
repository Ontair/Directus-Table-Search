const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function buildCsvDocument(headers: string[], rows: unknown[][]): string {
	const lines = [headers, ...rows].map((row) => headers.map((_, index) => encodeCsvCell(row[index])).join(','));

	return `\uFEFF${lines.join('\r\n')}`;
}

export function createCsvFilename(collection: string, date = new Date()): string {
	const datePart = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
		.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
		.join('');
	return `${collection}-${datePart}.csv`;
}

export function downloadCsvFile(filename: string, content: string): void {
	const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
	const anchor = document.createElement('a');
	anchor.download = filename;
	anchor.href = url;
	anchor.style.display = 'none';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function encodeCsvCell(value: unknown): string {
	let normalized = normalizeCsvValue(value);
	if (typeof value === 'string' && FORMULA_PREFIX.test(normalized)) normalized = `'${normalized}`;
	return `"${normalized.replaceAll('"', '""')}"`;
}

function normalizeCsvValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
	if (value instanceof Date) return value.toISOString();

	try {
		return JSON.stringify(value) ?? '';
	} catch {
		return '[Unserializable value]';
	}
}
