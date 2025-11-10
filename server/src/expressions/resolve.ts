import { parseExpression, getValueByPath } from './utils';

// Resolve expression like 'patient.name' or 'medications[0].name'
export function resolveExpression(expr: string, vars: Record<string, unknown>): unknown {
	const path = parseExpression(expr);
	if (path.length === 0 || !(path[0] in vars)) return undefined;

	const root = vars[path[0]];
	return getValueByPath(root, path.slice(1));
}

// Replace placeholders ${...} in an object with values from vars
export function replacePlaceholders(obj: unknown, vars: Record<string, unknown>): unknown {
	if (typeof obj === 'string') {
		return obj.replace(/\${(.*?)}/g, (match, expr) => {
			const value = resolveExpression(expr, vars);
			if (value === undefined) {
				throw new Error(`Variable "${expr}" is not defined in context.`);
			}
			return String(value);
		});
	} else if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
		const result: Record<string, unknown> = {};
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				result[key] = replacePlaceholders((obj as Record<string, unknown>)[key], vars);
			}
		}
		return result;
	} else if (Array.isArray(obj)) {
		return obj.map(item => replacePlaceholders(item, vars));
	}
	return obj;
}
