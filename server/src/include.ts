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

export function loadAndValidateIncludedContent(
    filepath: string,
    baseDir: string
): any {
    const fullPath = path.resolve(url.fileURLToPath(baseDir), filepath);
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

export function processIncludes(
    node: any,
    baseDir: string
): any {
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