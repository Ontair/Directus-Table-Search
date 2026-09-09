export function getValueAtPath(value: Record<string, unknown>, path: string): unknown {
	return path
		.split('.')
		.filter((segment) => !segment.startsWith('$'))
		.reduce<unknown>((current, segment) => {
			if (current === null || current === undefined || typeof current !== 'object') return undefined;
			return (current as Record<string, unknown>)[segment];
		}, value);
}
