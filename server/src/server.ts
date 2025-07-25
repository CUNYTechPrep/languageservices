/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	NotificationType,
	ShowMessageNotification,
	MessageType,
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

import { logger, logErrorToFile, logResponseToFile } from './logger';

import { LLMError, handleLLMError } from './errorHandler';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse, stringify } from 'yaml';

import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';

import { resolveExpression, replacePlaceholders } from './expressions';
import { processIncludes } from './include';

const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

interface ActionContext {
	[key: string]: any;
	prompt?: string;
	data?: any;
	correctedData?: string;
	llmResult?: string;
}

interface LLMResponse {
	choices: {
		message?: {
			role: string;
			content: string;
		};
	}[];
}

// we need to map keywords -> actions, lets do the following:
const actionHandlers = new Map<string, (data: any, context?: any) => Promise<any>>();
function registerActionHandlers() {
	// actions associated with a function for each keywords
	actionHandlers.set('prompt', handlePromptAction);
	actionHandlers.set('correct', handleCorrectionAction);
	actionHandlers.set('data', handleDataAction);
}

// handler functions below, probably repeating code for handleCorrectionAction, but lets
// just get functionality first

async function handlePromptAction(data: any, context?: any) {
	connection.console.log('Prompt keyword found: ' + JSON.stringify(data));
	if (context) {
		context.prompt = data;
	}
	return { type: 'prompt', data };
}

async function handleCorrectionAction(data: any, context?: any) {
	connection.console.log('Correct keyword found: ' + JSON.stringify(data));
	if (data === true && context && context.data) {
		const contentForLLM = `
	  Please correct the following code or syntax:
	  ${context.data}
	  
	  Return ONLY the corrected code. NOTHING ELSE.
	  `;

		try {
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer ' + OPENROUTER_KEY,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'deepseek/deepseek-chat-v3-0324:free',
					models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
					messages: [
						{
							role: 'user',
							content: contentForLLM,
						},
					],
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to correct content');
			}

			const result = (await response.json()) as LLMResponse;
			context.correctedData = result.choices[0]?.message?.content;
			return { type: 'correction', original: context.data, corrected: context.correctedData };
		} catch (error: any) {
			connection.console.error('Error in correction action: ' + error);
			return { type: 'correction', error: error.message };
		}
	}
	return { type: 'correction', skipped: true, reason: 'Correction not requested or no data' };
}

async function traverseYamlAndExecuteActions(yamlObject: any) {
	const results = [];
	const context: ActionContext = {};

	for (const [key, value] of Object.entries(yamlObject)) {
		if (actionHandlers.has(key)) {
			context[key] = value;
		}
	}

	for (const [key, value] of Object.entries(yamlObject)) {
		if (actionHandlers.has(key)) {
			const handler = actionHandlers.get(key);
			if (handler) {
				const result = await handler(value, context);
				results.push({ key, result });
			} else {
				connection.console.warn(`Handler for key '${key}' exists in map but is undefined`);
			}
		}

		if (value && typeof value === 'object' && !Array.isArray(value)) {
			connection.console.log(`Found nested object at key '${key}'`);
		}
	}

	if (context['prompt'] && context['data'] && !results.some(r => r.key === 'llm')) {
		const result = await executeDefaultLLMAction(context);
		results.push({ key: 'llm', result });
	}

	return { results, context };
}

async function executeDefaultLLMAction(context: any): Promise<any> {
	const prompt = context.prompt;
	const data = context.data;
	const correctedData = context.correctedData || data; // check for correction (optional)

	const contentForLLM = `
	I have the following YAML text:
	
	prompt: ${prompt}
	data: ${typeof correctedData === 'string' ? correctedData : JSON.stringify(correctedData)}
	
	Perform the requested operation from the prompt on the data.
	Return ONLY the result as a single line, with no explanation, code blocks, or additional formatting.
	`;

	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer ' + OPENROUTER_KEY,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [
					{
						role: 'user',
						content: contentForLLM,
					},
				],
			}),
		});

		if (!response.ok) {
			const error = (await response.json()) as any;
			throw new Error(error.error?.message || 'Unknown error');
		}

		const result = (await response.json()) as LLMResponse;
		context.llmResult = result.choices[0]?.message?.content;
		return { type: 'llm_processing', result: context.llmResult };
	} catch (error: any) {
		connection.console.error('Error executing LLM action: ' + error);
		return { type: 'llm_processing', error: error.message };
	}
}

async function handleDataAction(data: any, context?: any) {
	connection.console.log('Data keyword found: ' + typeof data);
	if (context) {
		context.data = data;
	}
	return { type: 'data', dataType: typeof data };
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let loadedVariables: Record<string, any> = {};

// helper functions for data-structure parsing
function parseYamlContent(content: string, docUri: string) {
	try {
		const yamlData = parse(content);
		const replacedData = replacePlaceholders(yamlData, loadedVariables);

		const parsedContent = processIncludes(replacedData, path.dirname(docUri));

		if (parsedContent.correct === true) {
			return {
				parsedContent,
				isCorrection: true,
				shouldReplace: true,
				dataToCorrect: parsedContent.data || '',
			};
		}

		const parsedPrompt = parsedContent.prompt;
		let parsedData = parsedContent.data;
		if (typeof parsedData === 'string') {
			parsedData = parsedData
				.split(/\s+/)
				.map(line => line.trim())
				.filter(item => item.length > 0);
		}
		return {
			parsedContent,
			parsedPrompt,
			parsedData,
			isCorrection: false,
		};
	} catch (error) {
		connection.console.error('Error parsing YAML: ' + error);
		return null;
	}
}

function extractSchemaKeywords(schema: any) {
	const keywords = [];
	if (schema.properties) {
		// TODO: await for Matthew's Schema implementation to extract the right important keywords
		for (const [key, val] of Object.entries(schema.properties)) {
			keywords.push({
				key_word: key,
				value_type: val,
				appearsInYaml: false,
			});
		}
	}
	return keywords;
	// it's expected that all of the schema important keywords will show up in the return as an []
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

function notifyClientError(message: string) {
	connection.sendNotification(ShowMessageNotification.type, {
		type: MessageType.Error,
		message: message,
	});
}

// ENDPOINTS START HERE (onRequests)
connection.onRequest(
	'llm-feedback.insertComment',
	async (params: { uri: string; range: any; text: string }) => {
		// use func parseYamlContent() here
		console.log(params.text);
		const doc = documents.get(params.uri);
		if (!doc) {
			return { success: false, error: 'Document not found' };
		}
		try {
			const yamlData = parse(params.text);
			// Replace variables in the text using the context data
			const replacedData = replacePlaceholders(yamlData, loadedVariables);

			const parsedContent = processIncludes(replacedData, path.dirname(doc.uri));
			if (!parsedContent) {
				return {
					success: false,
					error: 'failed parsing YAML content',
				};
			}
			connection.console.log(
				'Parsed YAML Content: ' + JSON.stringify(parsedContent.parsedContent, null, 2)
			);

			const llmPrompt = `
				1.Convert the following prompts into a YAML format that uses a pseudo code that you can interpret precisely.
				2.Evaluate the YAML and write any improvements and extensions.
				3.Revise the original YAML to include all the improvements and extension you suggested with comments.
				4.Extract all the keywords used in the YAML specification and list them, explaining how each is to be used.
				Return prompt 3 and 4 only. Prompt 4 should have the keywords in json format, keywords{word:,explanation:}
				`.trim();
			// Not using the above, but leaving it here for future.
			//Key words should soon be returned as well, probably in a list or tuple format. These can be used to to replace the existing ones
			let contentForLLM;
			if (parsedContent.isCorrection) {
				contentForLLM = `
			Please correct the following code or syntac:
			${parsedContent.dataToCorrect}

			Return ONLY the corrected code. NOTHING ELSE. 
			`;
			} else {
				contentForLLM = `
			I have the following YAML text:
			${params.text}
			Parsed YAML text here:
			prompt: ${parsedContent.parsedPrompt}
			data: ${JSON.stringify(parsedContent.parsedData)}
			Perform the requested operation from the prompt on the data.
			Return ONLY the result as a single YAML Comment line, with no explanation, code blocks, or additional formatting.
			`;
			}
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer ' + OPENROUTER_KEY,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'deepseek/deepseek-chat-v3-0324:free', // Model
					models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'], //Backup models for OpenRouter server
					messages: [
						{
							role: 'user',
							content: params.text + llmPrompt, //swapped for llmcontent here  Send prompt and data from YAML
						},
					],
				}),
			});

			//hanlde error here
			if (!response.ok) {
				const error = (await response.json()) as {
					error: { message: string; code: string };
				};
				console.log(error);
				throw new LLMError(error.error.code, error.error.message);
			}

			interface OpenAIResponse {
				choices: {
					message?: {
						role: string;
						content: string;
					};
					error?: {
						message: string;
						code: string;
					};
				}[];
			}
			const result = (await response.json()) as OpenAIResponse;
			if (result.choices[0].error) {
				const error = result.choices[0].error;
				throw new LLMError(error.code, error.message);
			}
			console.log(result);
			connection.console.log('LLM Prompt:' + contentForLLM);
			connection.console.log('LLM Response:' + JSON.stringify(result, null, 2));
			const feedback = result.choices[0]?.message?.content ?? '';
			//logResponseToFile(params.text, result);
			if (parsedContent.isCorrection && parsedContent.shouldReplace) {
				return {
					success: true,
					replaceSelection: true,
					replacement: feedback,
				};
			} else {
				const cleanFeedback = feedback.trim(); //.replace(/\n/g, ' ') if you want a single line
				return {
					success: true,
					comment: cleanFeedback,
					position: {
						line: params.range.end.line + 1, //inserts after highlihged block
						character: 0,
					},
				};
			}
		} catch (error) {
			if (error instanceof LLMError) {
				//logErrorToFile(params.text, error)
				const errorMessage = handleLLMError(error);
				notifyClientError(errorMessage);
				notifyClientError(error.message);
				return { success: false, error: errorMessage };
			}
		}
	}
);

connection.onRequest(
	'llm-schema.extractKeywords',
	async (params: { schema: any; yamlText?: string }) => {
		try {
			const schemaKeywords = extractSchemaKeywords(params.schema);

			if (params.yamlText) {
				try {
					const parsedYaml = parse(params.yamlText);

					for (let i = 0; i < schemaKeywords.length; i++) {
						if (parsedYaml.hasOwnProperty(schemaKeywords[i].key_word)) {
							schemaKeywords[i].appearsInYaml = true;
						}
					}

					connection.console.log(
						`Compared ${schemaKeywords.length} schema keywords with YAML content`
					);
				} catch (error) {
					connection.console.warn(
						'Could not parse YAML to compare with schema: ' + error
					);
				}
			}

			return { success: true, keywords: schemaKeywords };
		} catch (error) {
			connection.console.error("Couldn't extract keywords: " + error);
			return { success: false, error: "Couldn't extract keywords" };
		}
	}
);

connection.onRequest('yaml.replaceVariable', async (params: { uri: string; text: string }) => {
	const doc = documents.get(params.uri);
	if (!doc) {
		return { success: false, error: 'Document not found' };
	}
	try {
		// const contextData = params.context;
		const yamlData = parse(params.text);
		// Replace variables in the text using the context data
		const replacedData = replacePlaceholders(yamlData, loadedVariables);

		const yamlImported = processIncludes(replacedData, path.dirname(doc.uri));
		//connection.console.log(JSON.stringify(replacedData, null, 2));
		// Convert the modified YAML object back to a string
		const yamlString = stringify(yamlImported);
		connection.console.log(yamlString);
		// Send the modified YAML string back to the client
		return {
			success: true,
			modifiedText: yamlString,
		};
	} catch (error) {
		connection.console.error('Error processing YAML: ' + error);
		return { success: false, error: 'Error processing YAML' };
	}
});

connection.onRequest('yaml-actions.execute', async (params: { uri: string; yamlText: string }) => {
	const doc = documents.get(params.uri);
	if (!doc) {
		return { success: false, error: 'Document not found' };
	}
	try {
		connection.console.log('Executing YAML actions for: ' + params.yamlText);
		const yamlData = parse(params.yamlText);
		// Replace variables in the text using the context data
		const replacedData = replacePlaceholders(yamlData, loadedVariables);

		const parsedYaml = processIncludes(replacedData, path.dirname(doc.uri));
		connection.console.log('Parsed YAML Content: ' + JSON.stringify(parsedYaml, null, 2));
		const { results, context } = await traverseYamlAndExecuteActions(parsedYaml);

		return {
			success: true,
			results,
			llmResult: context.llmResult,
			correctedData: context.correctedData,
			context,
		};
	} catch (error: any) {
		connection.console.error('Error executing YAML actions: ' + error);
		return { success: false, error: 'Failed to execute YAML actions: ' + error.message };
	}
});

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
					loadedVariables = parse(fileContent) as Record<string, any>;
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
	registerActionHandlers();
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
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
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

	// 2. Check for undefined variables in ${...}
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
