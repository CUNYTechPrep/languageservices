import { parseExpression, getValueByPath } from "./utils";

// Resolve expression like 'patient.name' or 'medications[0].name'
export function resolveExpression(expr: string, vars: Record<string, any>): any {
	const path = parseExpression(expr);
	if (path.length === 0 || !(path[0] in vars)) return undefined;

	const root = vars[path[0]];
	return getValueByPath(root, path.slice(1));
}
  
export function replacePlaceholders(obj: any, vars: Record<string, any>): any {
	if (typeof obj === "string") {
		return obj.replace(/\${(.*?)}/g, (match, expr) => {
			const value = resolveExpression(expr, vars);
			if (value === undefined) {
				throw new Error(`Variable "${expr}" is not defined in context.`);
			}
			return value;
	  });
	} else if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				obj[key] = replacePlaceholders(obj[key], vars);
			}
		}
	} else if (Array.isArray(obj)) {
		for (let i = 0; i < obj.length; i++) {
			obj[i] = replacePlaceholders(obj[i], vars);
		}
	}
	return obj;
};