export function parseYamlFromCodeBlockRegex(input: string): string {
	const yamlMatch = input.match(/```yaml\s*\n?([\s\S]*?)\n?```/);

	if (!yamlMatch) {
		return input.trim();
	}

	const yamlContent = yamlMatch[1].trim();

	return yamlContent;
}

export function parseJsonFromCodeBlockRegex(input: string): string {
	// Look for a ```json code block first
	const jsonMatch = input.match(/```json\s*\n?([\s\S]*?)\n?```/);

	if (jsonMatch) {
		return jsonMatch[1].trim();
	}

	// Fallback: extract JSON object by finding matching braces
	// Find the first opening brace
	const firstBrace = input.indexOf('{');
	if (firstBrace === -1) {
		return input.trim();
	}

	// Count braces to find the matching closing brace
	let depth = 0;
	let inString = false;
	let escape = false;

	for (let i = firstBrace; i < input.length; i++) {
		const char = input[i];

		if (escape) {
			escape = false;
			continue;
		}

		if (char === '\\') {
			escape = true;
			continue;
		}

		if (char === '"' && !escape) {
			inString = !inString;
			continue;
		}

		if (!inString) {
			if (char === '{') {
				depth++;
			} else if (char === '}') {
				depth--;
				if (depth === 0) {
					// Found the matching closing brace
					return input.substring(firstBrace, i + 1).trim();
				}
			}
		}
	}

	// If we couldn't find a matching brace, return the trimmed input
	return input.trim();
}
