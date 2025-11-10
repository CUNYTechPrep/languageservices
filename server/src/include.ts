import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import { parse } from 'yaml';

export function isIncludeDirective(node: any): node is { include: string } {
	return (
		typeof node === 'object' &&
		node !== null &&
		!Array.isArray(node) &&
		Object.keys(node).length === 1 &&
		Object.prototype.hasOwnProperty.call(node, 'include') &&
		typeof node['include'] === 'string'
	);
}

export function validateStaticContent(node: any) {
	if (typeof node === 'string') {
		if (node.includes('${')) {
			throw new Error(`Variable placeholder found: ${node}`);
		}
		return;
	}
	if (node === null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		node.forEach(item => validateStaticContent(item));
	} else if (isIncludeDirective(node)) {
		throw new Error(`Include directive found: ${node.include}`);
	} else {
		for (const key in node) {
			if (Object.prototype.hasOwnProperty.call(node, key)) {
				validateStaticContent(node[key]);
			}
		}
	}
}

export function loadAndValidateIncludedContent(filepath: string, baseDir: string): any {
	// Resolve the workspace root directory
	const workspaceRoot = path.resolve(url.fileURLToPath(baseDir));
	
	// Resolve the absolute path of the requested file
	const fullPath = path.resolve(workspaceRoot, filepath);
	
	// Normalize paths to prevent path traversal attacks
	const normalizedWorkspaceRoot = path.normalize(workspaceRoot);
	const normalizedFullPath = path.normalize(fullPath);
	
	// Security check: ensure the file is within the workspace directory
	if (!normalizedFullPath.startsWith(normalizedWorkspaceRoot + path.sep) && 
	    normalizedFullPath !== normalizedWorkspaceRoot) {
		throw new Error(
			`Security violation: Cannot include files outside the workspace. ` +
			`Attempted to access: ${filepath}`
		);
	}
	
	// Check if file exists
	if (!fs.existsSync(fullPath)) {
		throw new Error(`Include file not found: ${filepath}`);
	}
	
	const fileExtension = path.extname(fullPath).toLowerCase();
	const fileContent = fs.readFileSync(fullPath, 'utf8');
	if (fileExtension === '.yaml') {
		const parsedContent = parse(fileContent);
		validateStaticContent(parsedContent);
		return parsedContent;
	} else {
		return null;
	}
}

export function processIncludes(node: any, baseDir: string): any {
	if (node === null || typeof node !== 'object') return node;
	if (Array.isArray(node)) {
		return node.map(item => processIncludes(item, baseDir));
	}
	if (isIncludeDirective(node)) {
		const filepath = node.include;
		return loadAndValidateIncludedContent(filepath, baseDir);
	}
	const processedObject: any = {};
	for (const key in node) {
		if (Object.prototype.hasOwnProperty.call(node, key)) {
			processedObject[key] = processIncludes(node[key], baseDir);
		}
	}
	return processedObject;
}
