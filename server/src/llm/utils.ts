export function parseYamlFromCodeBlockRegex(input: string): string {
	const yamlMatch = input.match(/```yaml\s*\n?([\s\S]*?)\n?```/);

	if (!yamlMatch) {
		return input.trim();
	}

	const yamlContent = yamlMatch[1].trim();

	return yamlContent;
}
