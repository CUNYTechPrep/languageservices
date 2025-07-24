// Parse expression like 'a.b[0].c' into path array: ['a', 'b', '0', 'c']
export function parseExpression(expr: string): string[] {
	return expr
		.trim()
		.split(/[.\[\]]+/)
		.filter(Boolean);
}

// Get value at a path inside an object
export function getValueByPath(obj: any, path: string[]): any {
	let result = obj;
	for (const key of path) {
		if (result == null) return undefined;

		// Support numeric keys (e.g., arrays)
		const index = !isNaN(Number(key)) ? Number(key) : key;
		result = result[index];

		if (result === undefined) return undefined;
	}
	return result;
}
