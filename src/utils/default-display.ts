const DEFAULT_DISPLAYS: Record<string, string> = {
	alias: 'raw',
	bigInteger: 'formatted-value',
	binary: 'raw',
	boolean: 'boolean',
	csv: 'labels',
	date: 'datetime',
	dateTime: 'datetime',
	decimal: 'formatted-value',
	float: 'formatted-value',
	geometry: 'raw',
	'geometry.LineString': 'raw',
	'geometry.MultiLineString': 'raw',
	'geometry.MultiPoint': 'raw',
	'geometry.MultiPolygon': 'raw',
	'geometry.Point': 'raw',
	'geometry.Polygon': 'raw',
	hash: 'formatted-value',
	integer: 'formatted-value',
	json: 'raw',
	string: 'formatted-value',
	text: 'formatted-value',
	time: 'datetime',
	timestamp: 'datetime',
	unknown: 'raw',
	uuid: 'formatted-value',
};

export function getDefaultDisplay(type: string): string {
	return DEFAULT_DISPLAYS[type] ?? 'raw';
}
