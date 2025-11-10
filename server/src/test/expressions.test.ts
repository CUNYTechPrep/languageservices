import * as assert from 'assert';
import { resolveExpression, replacePlaceholders } from '../expressions/resolve';
import { parseExpression, getValueByPath } from '../expressions/utils';

suite('Expression Resolution Tests', () => {
	suite('parseExpression', () => {
		test('should parse simple property access', () => {
			const result = parseExpression('user.name');
			assert.deepStrictEqual(result, ['user', 'name']);
		});

		test('should parse array index access', () => {
			const result = parseExpression('items[0].name');
			assert.deepStrictEqual(result, ['items', '0', 'name']);
		});

		test('should parse nested array access', () => {
			const result = parseExpression('data[0][1].value');
			assert.deepStrictEqual(result, ['data', '0', '1', 'value']);
		});

		test('should handle empty string', () => {
			const result = parseExpression('');
			assert.deepStrictEqual(result, []);
		});

		test('should handle whitespace', () => {
			const result = parseExpression('  user.name  ');
			assert.deepStrictEqual(result, ['user', 'name']);
		});
	});

	suite('getValueByPath', () => {
		test('should get nested property value', () => {
			const obj = { user: { name: 'John', age: 30 } };
			const result = getValueByPath(obj, ['user', 'name']);
			assert.strictEqual(result, 'John');
		});

		test('should get array element', () => {
			const obj = { items: ['apple', 'banana', 'cherry'] };
			const result = getValueByPath(obj, ['items', '1']);
			assert.strictEqual(result, 'banana');
		});

		test('should return undefined for non-existent path', () => {
			const obj = { user: { name: 'John' } };
			const result = getValueByPath(obj, ['user', 'email']);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined for null intermediate value', () => {
			const obj = { user: null };
			const result = getValueByPath(obj, ['user', 'name']);
			assert.strictEqual(result, undefined);
		});

		test('should handle empty path', () => {
			const obj = { value: 42 };
			const result = getValueByPath(obj, []);
			assert.deepStrictEqual(result, obj);
		});

		test('should get nested array element property', () => {
			const obj = { users: [{ name: 'Alice' }, { name: 'Bob' }] };
			const result = getValueByPath(obj, ['users', '1', 'name']);
			assert.strictEqual(result, 'Bob');
		});
	});

	suite('resolveExpression', () => {
		test('should resolve simple variable', () => {
			const vars = { username: 'Alice' };
			const result = resolveExpression('username', vars);
			assert.strictEqual(result, 'Alice');
		});

		test('should resolve nested property', () => {
			const vars = { user: { profile: { email: 'alice@example.com' } } };
			const result = resolveExpression('user.profile.email', vars);
			assert.strictEqual(result, 'alice@example.com');
		});

		test('should resolve array element', () => {
			const vars = { colors: ['red', 'green', 'blue'] };
			const result = resolveExpression('colors[1]', vars);
			assert.strictEqual(result, 'green');
		});

		test('should return undefined for missing variable', () => {
			const vars = { username: 'Alice' };
			const result = resolveExpression('email', vars);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined for empty expression', () => {
			const vars = { username: 'Alice' };
			const result = resolveExpression('', vars);
			assert.strictEqual(result, undefined);
		});
	});

	suite('replacePlaceholders', () => {
		test('should replace placeholder in string', () => {
			const obj = 'Hello ${name}!';
			const vars = { name: 'World' };
			const result = replacePlaceholders(obj, vars);
			assert.strictEqual(result, 'Hello World!');
		});

		test('should replace multiple placeholders', () => {
			const obj = '${greeting} ${name}, you are ${age} years old';
			const vars = { greeting: 'Hello', name: 'Alice', age: 25 };
			const result = replacePlaceholders(obj, vars);
			assert.strictEqual(result, 'Hello Alice, you are 25 years old');
		});

		test('should replace placeholders in object properties', () => {
			const obj = { message: 'Hello ${name}', status: 'active' };
			const vars = { name: 'Bob' };
			const result = replacePlaceholders(obj, vars);
			assert.deepStrictEqual(result, { message: 'Hello Bob', status: 'active' });
		});

		test('should replace placeholders in array elements', () => {
			const obj = ['Hello ${name}', 'Goodbye ${name}'];
			const vars = { name: 'Charlie' };
			const result = replacePlaceholders(obj, vars);
			assert.deepStrictEqual(result, ['Hello Charlie', 'Goodbye Charlie']);
		});

		test('should handle nested objects', () => {
			const obj = { user: { greeting: 'Hi ${username}' } };
			const vars = { username: 'Dave' };
			const result = replacePlaceholders(obj, vars);
			assert.deepStrictEqual(result, { user: { greeting: 'Hi Dave' } });
		});

		test('should throw error for undefined variable', () => {
			const obj = 'Hello ${unknown}';
			const vars = { name: 'World' };
			assert.throws(() => {
				replacePlaceholders(obj, vars);
			}, /Variable "unknown" is not defined in context/);
		});

		test('should handle non-string values', () => {
			const obj = { count: 42, enabled: true, data: null };
			const vars = {};
			const result = replacePlaceholders(obj, vars);
			assert.deepStrictEqual(result, { count: 42, enabled: true, data: null });
		});

		test('should replace with nested variable path', () => {
			const obj = 'User email: ${user.email}';
			const vars = { user: { email: 'test@example.com' } };
			const result = replacePlaceholders(obj, vars);
			assert.strictEqual(result, 'User email: test@example.com');
		});
	});
});
