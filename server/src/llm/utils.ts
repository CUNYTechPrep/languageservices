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

	// Fallback: attempt to extract a raw JSON object from the response
	const objMatch = input.match(/(\{[\s\S]*\})/m);
	if (objMatch) {
		return objMatch[1].trim();
	}

	return input.trim();
}
