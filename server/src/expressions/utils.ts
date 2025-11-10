// Parse expression like 'a.b[0].c' into path array: ['a', 'b', '0', 'c']
export function parseExpression(expr: string): string[] {
	return expr
		.trim()
		.split(/[.[\]]+/)
		.filter(Boolean);
}

// Get value at a path inside an object
export function getValueByPath(obj: unknown, path: string[]): unknown {
	let result: unknown = obj;
	for (const key of path) {
		if (result == null) return undefined;

		// Support numeric keys (e.g., arrays)
		const index = !isNaN(Number(key)) ? Number(key) : key;

		// Type guard to ensure result is an object or array
		if (typeof result !== 'object' || result === null) {
			return undefined;
		}

		result = (result as Record<string, unknown> | unknown[])[index as keyof typeof result];

		if (result === undefined) return undefined;
	}
	return result;
}
