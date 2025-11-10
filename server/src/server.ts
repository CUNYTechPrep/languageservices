/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse, stringify } from 'yaml';

import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';

import { resolveExpression, replacePlaceholders } from './expressions';
import { processIncludes } from './include';
import { isYamlWorkflowDocument, ParseResult } from './types';

import yamlWorkflowBuilder from './llm/YamlWorkflowBuilder';
import yamlExecutor from './YamlExecutor';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let loadedVariables: Record<string, unknown> = {};

// helper functions for data-structure parsing
function parseYamlContent(content: string, docUri: string): ParseResult {
	try {
		// Phase 1: Parse YAML
		let yamlData: unknown;
		try {
			yamlData = parse(content);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				phase: 'parsing',
				error: `YAML syntax error: ${errorMessage}`,
			};
		}

		// Phase 2: Replace variables
		let replacedData: unknown;
		try {
			replacedData = replacePlaceholders(yamlData, loadedVariables);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				phase: 'variable-replacement',
				error: `Variable resolution error: ${errorMessage}`,
			};
		}

		// Phase 3: Process includes
		let parsedContent: unknown;
		try {
			parsedContent = processIncludes(replacedData, path.dirname(docUri));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				phase: 'include-processing',
				error: `Include processing error: ${errorMessage}`,
			};
		}

		// Phase 4: Validate structure
		if (!isYamlWorkflowDocument(parsedContent)) {
			return {
				success: false,
				phase: 'validation',
				error: 'Document structure is invalid. Expected a workflow document with optional "steps" array.',
			};
		}

		return {
			success: true,
			data: parsedContent,
		};
	} catch (error) {
		// Catch-all for unexpected errors
		const errorMessage = error instanceof Error ? error.message : String(error);
		connection.console.error(`Unexpected error parsing YAML: ${errorMessage}`);
		return {
			success: false,
			phase: 'parsing',
			error: `Unexpected error: ${errorMessage}`,
		};
	}
}

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true,
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
		},
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true,
			},
		};
	}
	return result;
});

// ENDPOINTS START HERE (onRequests)
connection.onRequest('prompt.refine', async (params: { uri: string }) => {
	try {
		const doc = documents.get(params.uri);
		if (!doc) {
			return { success: false, error: 'Document not found' };
		}
		const text = doc.getText();
		if (!text) {
			return { success: false, error: 'Document is empty' };
		}

		const refinedPrompt = await yamlWorkflowBuilder.refinePrompt(text);

		if (!refinedPrompt || refinedPrompt.trim() === '') {
			return { success: false, error: 'Error refining prompt' };
		}

		return { success: true, refinedPrompt };
	} catch (error) {
		connection.console.error('Error refining prompt: ' + error);
		return { success: false, error: 'Error refining prompt' };
	}
});

connection.onRequest('script.getScript', async (params: { uri: string }) => {
	try {
		const doc = documents.get(params.uri);
		if (!doc) {
			return { success: false, error: 'Document not found' };
		}
		const text = doc.getText();
		if (!text) {
			return { success: false, error: 'Document is empty' };
		}

		const result = await yamlWorkflowBuilder.createYamlScript(text);
		if (!result || !result.yaml || result.yaml.trim() === '') {
			connection.console.error('Error creating yaml script');
			return { success: false, error: 'Error creating yaml script' };
		}

		// Log and return YAML and schema
		connection.console.log('Yaml Script: ' + result.yaml);

		// Persist schema to workspace .vscode folder for later access
		try {
			const workspaceFolders = await connection.workspace.getWorkspaceFolders();
			if (workspaceFolders && workspaceFolders.length > 0) {
				const folderUri = workspaceFolders[0].uri;
				const folderPath = url.fileURLToPath(folderUri);
				const vscodeDir = path.join(folderPath, '.vscode');
				fs.mkdirSync(vscodeDir, { recursive: true });
				const schemaPath = path.join(vscodeDir, 'workflow.schema.json');
				fs.writeFileSync(schemaPath, JSON.stringify(result.schema || {}, null, 2), 'utf8');
				connection.console.log('Saved schema to: ' + schemaPath);
			}
		} catch (err) {
			connection.console.error('Failed to persist schema: ' + err);
		}

		return { success: true, yamlScript: result.yaml, schema: result.schema };
	} catch (error) {
		connection.console.error('Error creating yaml script: ' + error);
		return { success: false, error: 'Error creating yaml script' };
	}
});

connection.onRequest('script.refine', async (params: { uri: string; prompt: string }) => {
	try {
		const doc = documents.get(params.uri);
		if (!doc) {
			return { success: false, error: 'Document not found' };
		}
		const text = doc.getText();
		if (!text) {
			return { success: false, error: 'Document is empty' };
		}

		const result = await yamlWorkflowBuilder.refineYamlScript(text, params.prompt);
		if (!result || !result.yaml || result.yaml.trim() === '') {
			connection.console.error('Error refining yaml script');
			return { success: false, error: 'Error refining yaml script' };
		}

		connection.console.log('Yaml Script: ' + result.yaml);

		// Persist schema to workspace .vscode folder for later access
		try {
			const workspaceFolders = await connection.workspace.getWorkspaceFolders();
			if (workspaceFolders && workspaceFolders.length > 0) {
				const folderUri = workspaceFolders[0].uri;
				const folderPath = url.fileURLToPath(folderUri);
				const vscodeDir = path.join(folderPath, '.vscode');
				fs.mkdirSync(vscodeDir, { recursive: true });
				const schemaPath = path.join(vscodeDir, 'workflow.schema.json');
				fs.writeFileSync(schemaPath, JSON.stringify(result.schema || {}, null, 2), 'utf8');
				connection.console.log('Saved schema to: ' + schemaPath);
			}
		} catch (err) {
			connection.console.error('Failed to persist schema: ' + err);
		}

		return { success: true, yamlScript: result.yaml, schema: result.schema };
	} catch (error) {
		connection.console.error('Error refining yaml script: ' + error);
		return { success: false, error: 'Error refining yaml script' };
	}
});

connection.onRequest('script.test', async (params: { uri: string }) => {
	try {
		const doc = documents.get(params.uri);
		if (!doc) {
			return { success: false, error: 'Document not found' };
		}
		const text = doc.getText();
		if (!text) {
			return { success: false, error: 'Document is empty' };
		}

		const yamlParsed = parseYamlContent(text, doc.uri);

		if (!yamlParsed.success) {
			connection.console.error(
				`YAML parsing failed (${yamlParsed.phase}): ${yamlParsed.error}`
			);
			return {
				success: false,
				error: `Failed to parse YAML (${yamlParsed.phase}): ${yamlParsed.error}`,
			};
		}

		const testResults = await yamlExecutor.testYamlWithPromptChaining(
			stringify(yamlParsed.data)
		);

		if (!testResults || Object.keys(testResults).length === 0) {
			connection.console.error('Error testing yaml script: empty result');
			return { success: false, error: 'Error testing yaml script' };
		}

		// Return the raw object, not a markdown string
		return { success: true, testResults };
	} catch (error) {
		connection.console.error('Error testing yaml script: ' + error);
		return { success: false, error: 'Error testing yaml script' };
	}
});

// END OF ENDPOINTS

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});

		// When server starts, load the variables from *.vars.yaml file in the root of workspace
		const workspaceFolders = await connection.workspace.getWorkspaceFolders();
		if (workspaceFolders && workspaceFolders.length > 0) {
			const folderUri = workspaceFolders[0].uri;
			const folderPath = url.fileURLToPath(folderUri);

			try {
				const files = fs.readdirSync(folderPath);
				const varsFiles = files.filter(file => file.endsWith('.vars.yaml'));

				if (varsFiles.length > 0) {
					const firstMatchPath = path.join(folderPath, varsFiles[0]);
					const fileContent = fs.readFileSync(firstMatchPath, 'utf8');
					loadedVariables = parse(fileContent) as Record<string, unknown>;
				} else {
					loadedVariables = {};
				}
			} catch (error) {
				loadedVariables = {};
				connection.console.error(`Error loading *.vars.yaml file: ${error}`);
				connection.window.showErrorMessage(`Error loading *.vars.yaml file: ${error}`);
			}
		}
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<ExampleSettings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = change.settings.languageServerExample || defaultSettings;
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample',
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

connection.languages.diagnostics.on(async params => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document),
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: [],
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
	const diagnostics = await validateTextDocument(change.document);
	// Send the diagnostics to the client
	connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	const text = textDocument.getText();
	let problems = 0;
	const diagnostics: Diagnostic[] = [];

	// 1. Try to parse the YAML and report any parsing errors
	const parseResult = parseYamlContent(text, textDocument.uri);
	if (!parseResult.success) {
		// Create a diagnostic for the parsing error
		// Since we don't have precise position info from the error, highlight the whole document
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			range: {
				start: textDocument.positionAt(0),
				end: textDocument.positionAt(text.length),
			},
			message: `${parseResult.error}`,
			source: parseResult.phase,
		});
		// Return early - no point in further validation if we can't parse
		return diagnostics;
	}

	// 2. The validator creates diagnostics for all uppercase words length 2 and more
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length),
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex',
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range),
					},
					message: 'Spelling matters',
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range),
					},
					message: 'Particularly for names',
				},
			];
		}
		diagnostics.push(diagnostic);
	}

	// 3. Check for undefined variables in ${...}
	const varPattern = /\${(.*?)}/g;
	while ((m = varPattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		const varExpr = m[1].trim();
		// Check if the variable exists in the loaded variables
		const exists = resolveExpression(varExpr, loadedVariables) !== undefined;

		if (!exists) {
			problems++;
			diagnostics.push({
				severity: DiagnosticSeverity.Warning,
				range: {
					start: textDocument.positionAt(m.index),
					end: textDocument.positionAt(m.index + m[0].length),
				},
				message: `Variable "${varExpr}" is not defined in context.`,
				source: 'vars',
			});
		}
	}

	return diagnostics;
}

connection.onDidChangeWatchedFiles(_change => {
	const changes = _change.changes; // List of FileEvent objects

	for (const change of changes) {
		// Handle file change events
		// Type 1: Created, Type 2: Changed, Type 3: Deleted
		if ((change.type == 1 || change.type === 2) && change.uri.endsWith('.vars.yaml')) {
			try {
				// Convert URI to file path
				const filePath = url.fileURLToPath(change.uri);

				// Read the file
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const jsonData = parse(fileContent);

				loadedVariables = jsonData; // Store the loaded variables in a global variable for now
			} catch (error) {
				connection.console.error(`Failed to process .vars.yaml: ${error}`);
				connection.window.showErrorMessage(`Failed to process .vars.yaml: ${error}`);
			}
		}
	}
});

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	connection.console.log('Completion requested at:');
	return [
		//create list structure
		{
			label: 'Yaml',
			kind: CompletionItemKind.Text,
			data: 1,
		},
		{
			label: 'data',
			kind: CompletionItemKind.Text,
			data: 2,
		},
		{
			label: 'prompt',
			kind: CompletionItemKind.Text,
			data: 3,
		},
		{
			label: '# send-to-llm',
			kind: CompletionItemKind.Text,
			data: 4,
		},
		{
			label: 'correct',
			kind: CompletionItemKind.Text,
			data: 5,
		},
	];
});
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = 'Yaml details';
		item.documentation = 'Yaml Docs';
	} else if (item.data === 2) {
		item.detail = 'Yaml array list or dict';
		item.documentation = 'Yaml documentation';
	} else if (item.data === 3) {
		item.detail = 'Prompt for llm';
		item.documentation = 'LLM documention, openrouter etc';
	} else if (item.data === 4) {
		item.detail = 'Call to send text to llm';
	} else if (item.data === 5) {
		item.detail = 'Correct code or syntax';
		item.documentation =
			'When set to true, the LLM will correct the code in the data section and replace the selection with the corrected code.';
	}
	return item;
	//when i get the new keywords, i want to append them to here or revise it
	//and for details i can put the comments or documentation here
});

documents.listen(connection);

// Listen on the connection
connection.listen();
