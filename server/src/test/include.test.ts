import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { isIncludeDirective, validateStaticContent, loadAndValidateIncludedContent, processIncludes } from '../include';

suite('Include Module Tests', () => {
	let tempDir: string;
	
	setup(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-test-'));
	});

	teardown(() => {
		// Clean up temporary directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	suite('isIncludeDirective', () => {
		test('should identify valid include directive', () => {
			const node = { include: 'file.yaml' };
			assert.strictEqual(isIncludeDirective(node), true);
		});

		test('should reject object with multiple properties', () => {
			const node = { include: 'file.yaml', other: 'value' };
			assert.strictEqual(isIncludeDirective(node), false);
		});

		test('should reject non-object', () => {
			assert.strictEqual(isIncludeDirective('string'), false);
			assert.strictEqual(isIncludeDirective(123), false);
			assert.strictEqual(isIncludeDirective(null), false);
			assert.strictEqual(isIncludeDirective(undefined), false);
		});

		test('should reject array', () => {
			const node = ['include', 'file.yaml'];
			assert.strictEqual(isIncludeDirective(node), false);
		});

		test('should reject include with non-string value', () => {
			const node = { include: 123 };
			assert.strictEqual(isIncludeDirective(node), false);
		});

		test('should reject empty object', () => {
			const node = {};
			assert.strictEqual(isIncludeDirective(node), false);
		});
	});

	suite('validateStaticContent', () => {
		test('should pass for plain object', () => {
			const node = { name: 'John', age: 30 };
			assert.doesNotThrow(() => validateStaticContent(node));
		});

		test('should pass for plain string', () => {
			const node = 'Hello world';
			assert.doesNotThrow(() => validateStaticContent(node));
		});

		test('should throw for string with variable placeholder', () => {
			const node = 'Hello ${name}';
			assert.throws(() => {
				validateStaticContent(node);
			}, /Variable placeholder found/);
		});

		test('should throw for include directive', () => {
			const node = { include: 'file.yaml' };
			assert.throws(() => {
				validateStaticContent(node);
			}, /Include directive found/);
		});

		test('should validate nested objects', () => {
			const node = { user: { name: 'John', greeting: 'Hello ${name}' } };
			assert.throws(() => {
				validateStaticContent(node);
			}, /Variable placeholder found/);
		});

		test('should validate arrays', () => {
			const node = ['plain', 'text', 'with ${variable}'];
			assert.throws(() => {
				validateStaticContent(node);
			}, /Variable placeholder found/);
		});

		test('should pass for null and primitives', () => {
			assert.doesNotThrow(() => validateStaticContent(null));
			assert.doesNotThrow(() => validateStaticContent(42));
			assert.doesNotThrow(() => validateStaticContent(true));
		});
	});

	suite('loadAndValidateIncludedContent', () => {
		test('should load valid YAML file', () => {
			const yamlFile = path.join(tempDir, 'test.yaml');
			fs.writeFileSync(yamlFile, 'name: Test\nvalue: 123', 'utf8');

			const result = loadAndValidateIncludedContent('test.yaml', `file://${tempDir}`);
			assert.deepStrictEqual(result, { name: 'Test', value: 123 });
		});

		test('should throw for file outside workspace (path traversal)', () => {
			const yamlFile = path.join(tempDir, 'test.yaml');
			fs.writeFileSync(yamlFile, 'name: Test', 'utf8');

			assert.throws(() => {
				loadAndValidateIncludedContent('../../../etc/passwd', `file://${tempDir}`);
			}, /Security violation: Cannot include files outside the workspace/);
		});

		test('should throw for non-existent file', () => {
			assert.throws(() => {
				loadAndValidateIncludedContent('nonexistent.yaml', `file://${tempDir}`);
			}, /Include file not found/);
		});

		test('should throw for YAML with variable placeholders', () => {
			const yamlFile = path.join(tempDir, 'vars.yaml');
			fs.writeFileSync(yamlFile, 'greeting: Hello ${name}', 'utf8');

			assert.throws(() => {
				loadAndValidateIncludedContent('vars.yaml', `file://${tempDir}`);
			}, /Variable placeholder found/);
		});

		test('should throw for YAML with include directives', () => {
			const yamlFile = path.join(tempDir, 'nested.yaml');
			fs.writeFileSync(yamlFile, 'include: another.yaml', 'utf8');

			assert.throws(() => {
				loadAndValidateIncludedContent('nested.yaml', `file://${tempDir}`);
			}, /Include directive found/);
		});

		test('should return null for non-YAML files', () => {
			const txtFile = path.join(tempDir, 'test.txt');
			fs.writeFileSync(txtFile, 'plain text', 'utf8');

			const result = loadAndValidateIncludedContent('test.txt', `file://${tempDir}`);
			assert.strictEqual(result, null);
		});
	});

	suite('processIncludes', () => {
		test('should return primitives unchanged', () => {
			assert.strictEqual(processIncludes('string', `file://${tempDir}`), 'string');
			assert.strictEqual(processIncludes(123, `file://${tempDir}`), 123);
			assert.strictEqual(processIncludes(true, `file://${tempDir}`), true);
			assert.strictEqual(processIncludes(null, `file://${tempDir}`), null);
		});

		test('should process array elements', () => {
			const arr = ['a', 'b', 'c'];
			const result = processIncludes(arr, `file://${tempDir}`);
			assert.deepStrictEqual(result, ['a', 'b', 'c']);
		});

		test('should process object properties', () => {
			const obj = { name: 'Test', value: 42 };
			const result = processIncludes(obj, `file://${tempDir}`);
			assert.deepStrictEqual(result, { name: 'Test', value: 42 });
		});

		test('should replace include directive with file content', () => {
			const yamlFile = path.join(tempDir, 'data.yaml');
			fs.writeFileSync(yamlFile, 'name: Included\nvalue: 999', 'utf8');

			const obj = { include: 'data.yaml' };
			const result = processIncludes(obj, `file://${tempDir}`);
			assert.deepStrictEqual(result, { name: 'Included', value: 999 });
		});

		test('should process nested objects with includes', () => {
			const yamlFile = path.join(tempDir, 'nested.yaml');
			fs.writeFileSync(yamlFile, 'nested: true', 'utf8');

			const obj = {
				config: { include: 'nested.yaml' },
				other: 'value'
			};
			const result = processIncludes(obj, `file://${tempDir}`) as Record<string, unknown>;
			assert.deepStrictEqual(result.config, { nested: true });
			assert.strictEqual(result.other, 'value');
		});

		test('should process arrays containing includes', () => {
			const yamlFile = path.join(tempDir, 'item.yaml');
			fs.writeFileSync(yamlFile, 'type: included', 'utf8');

			const arr = [
				'plain',
				{ include: 'item.yaml' },
				'another'
			];
			const result = processIncludes(arr, `file://${tempDir}`) as unknown[];
			assert.strictEqual(result[0], 'plain');
			assert.deepStrictEqual(result[1], { type: 'included' });
			assert.strictEqual(result[2], 'another');
		});
	});
});
