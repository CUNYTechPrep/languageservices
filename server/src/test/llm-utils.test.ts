import * as assert from 'assert';
import { parseYamlFromCodeBlockRegex, parseJsonFromCodeBlockRegex } from '../llm/utils';

suite('LLM Utils Tests', () => {
	suite('parseYamlFromCodeBlockRegex', () => {
		test('should extract YAML from code block', () => {
			const input = '```yaml\nname: Test\nvalue: 123\n```';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, 'name: Test\nvalue: 123');
		});

		test('should handle YAML without newlines after markers', () => {
			const input = '```yaml\nsteps:\n  - name: Step1\n```';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, 'steps:\n  - name: Step1');
		});

		test('should return trimmed input if no code block found', () => {
			const input = '  name: Test  ';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, 'name: Test');
		});

		test('should handle empty code block', () => {
			const input = '```yaml\n\n```';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, '');
		});

		test('should extract first YAML block when multiple exist', () => {
			const input = '```yaml\nfirst: 1\n```\nsome text\n```yaml\nsecond: 2\n```';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, 'first: 1');
		});

		test('should handle YAML with special characters', () => {
			const input = '```yaml\nmessage: "Hello, ${world}!"\n```';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, 'message: "Hello, ${world}!"');
		});

		test('should preserve indentation', () => {
			const input = '```yaml\nsteps:\n  - name: Step1\n    action: build\n```';
			const result = parseYamlFromCodeBlockRegex(input);
			assert.strictEqual(result, 'steps:\n  - name: Step1\n    action: build');
		});
	});

	suite('parseJsonFromCodeBlockRegex', () => {
		test('should extract JSON from code block', () => {
			const input = '```json\n{"name": "Test", "value": 123}\n```';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"name": "Test", "value": 123}');
		});

		test('should handle nested JSON objects', () => {
			const input = '```json\n{"user": {"name": "John", "age": 30}}\n```';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"user": {"name": "John", "age": 30}}');
		});

		test('should fallback to brace matching without code block', () => {
			const input = 'Here is the result: {"status": "ok", "data": {"count": 5}}';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"status": "ok", "data": {"count": 5}}');
		});

		test('should handle JSON with strings containing braces', () => {
			const input = '{"message": "Use { and } carefully", "valid": true}';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"message": "Use { and } carefully", "valid": true}');
		});

		test('should handle JSON with escaped quotes', () => {
			const input = '{"text": "He said \\"Hello\\"", "ok": true}';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"text": "He said \\"Hello\\"", "ok": true}');
		});

		test('should handle JSON with nested arrays', () => {
			const input = '{"items": [{"id": 1}, {"id": 2}], "count": 2}';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"items": [{"id": 1}, {"id": 2}], "count": 2}');
		});

		test('should return trimmed input if no JSON found', () => {
			const input = '  just plain text  ';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, 'just plain text');
		});

		test('should handle deeply nested objects', () => {
			const input = '{"a": {"b": {"c": {"d": "deep"}}}}\n';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"a": {"b": {"c": {"d": "deep"}}}}');
		});

		test('should handle mixed content before JSON', () => {
			const input = 'Some explanation text\n\nHere is the data:\n{"value": 42}';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"value": 42}');
		});

		test('should prefer code block over brace matching', () => {
			const input = '{"ignored": 1}\n```json\n{"preferred": 2}\n```';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{"preferred": 2}');
		});

		test('should handle empty JSON object', () => {
			const input = '```json\n{}\n```';
			const result = parseJsonFromCodeBlockRegex(input);
			assert.strictEqual(result, '{}');
		});

		test('should handle multiline formatted JSON', () => {
			const input = `\`\`\`json
{
  "name": "Test",
  "config": {
    "enabled": true,
    "timeout": 5000
  }
}
\`\`\``;
			const result = parseJsonFromCodeBlockRegex(input);
			const expected = `{
  "name": "Test",
  "config": {
    "enabled": true,
    "timeout": 5000
  }
}`;
			assert.strictEqual(result, expected);
		});
	});
});
