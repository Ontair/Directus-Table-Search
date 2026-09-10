export function getValueAtPath(value: Record<string, unknown>, path: string): unknown {
	const segments = path.split('.').filter((segment) => segment && !segment.startsWith('$'));

	return segments.length > 0 ? getWithArrays(value, segments) : undefined;
}

function getWithArrays(value: unknown, segments: string[]): unknown {
	const [rawKey, ...remaining] = segments;
	if (!rawKey) return value;

	const key = rawKey.split(':')[0] ?? rawKey;
	const result = Array.isArray(value) ? getArrayValues(value, key) : getProperty(value, key);

	if (result !== undefined && remaining.length > 0) return getWithArrays(result, remaining);
	return result ?? undefined;
}

function getArrayValues(value: unknown[], key: string): unknown {
	const result = value.map((entry) => getProperty(entry, key)).filter(Boolean);
	return result.length > 0 ? result.flat() : undefined;
}

function getProperty(value: unknown, key: string): unknown {
	if (value === null || typeof value !== 'object') return undefined;
	return (value as Record<string, unknown>)[key];
}
