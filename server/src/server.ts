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
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { parse, stringify } from 'yaml';
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;;
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// helper functions for data-structure parsing
function parseYamlContent(content: string) {
	try {
		const parsedContent = parse(content);
		const parsedPrompt = parsedContent.prompt;
		let parsedData = parsedContent.data;
		if (typeof parsedData === 'string') {
			parsedData = parsedData.split(/\s+/).map(line => line.trim()).filter(item => item.length > 0);
		}
		return {
			parsedContent,
			parsedPrompt,
			parsedData
		};
	} catch (error) {
		connection.console.error("Error parsing YAML: " + error);
		return null;
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
				resolveProvider: true
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onRequest('llm-feedback.insertComment', async (params: {uri: string, range: any, text: string})=>{
	// use func parseYamlContent() here
	console.log(params.text);
	const doc = documents.get(params.uri)
	if(!doc){
		return {success: false, error: 'Document not found'}
	}
	try{
		const parsedContent = parseYamlContent(params.text)
		if (!parsedContent) {
			return { 
				success: false,
				error: "failed parsing YAML content"
			};
		}
		connection.console.log("Parsed YAML Content: " + JSON.stringify(parsedContent.parsedContent, null, 2));

		const llmPrompt = `
				1.Convert the following prompts into a YAML format that uses a pseudo code that you can interpret precisely.
				2.Evaluate the YAML and write any improvements and extensions.
				3.Revise the original YAML to include all the improvements and extension you suggested with comments.
				4.Extract all the keywords used in the YAML specification and list them, explaining how each is to be used.
				Return prompt 3 and 4 only. Prompt 4 should have the keywords in json format, keywords{word:,explanation:}
				`.trim();
				// Not using the above, but leaving it here for future.
				//Key words should soon be returned as well, probably in a list or tuple format. These can be used to to replace the existing ones
		const contentForLLM = `
		I have the following YAML text:
		${params.text}

		Parsed YAML text here:
		prompt: ${parsedContent.parsedPrompt}
		data: ${JSON.stringify(parsedContent.parsedData)}
		Perform the requested operation from the prompt on the data.
		Return ONLY the result as a single YAML Comment line, with no explanation, code blocks, or additional formatting.
		`
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers:{
				"Authorization": "Bearer "+OPENROUTER_KEY,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				"model": "deepseek/deepseek-chat-v3-0324:free", // Model 
				"messages": [
					{
						"role": "user",
						"content": contentForLLM // Send prompt and data from YAML
					}
				]
			})
		});
		interface OpenAIResponse {
						choices: {
						  message: {
							role: string;
							content: string;
						  };
						}[];
					  }
		const result = await response.json() as OpenAIResponse
		connection.console.log("LLM Prompt:" + contentForLLM)
		connection.console.log("LLM Response:"+ JSON.stringify(result, null, 2)); 
		const feedback = result.choices[0].message.content;

		const cleanFeedback = feedback.replace(/\n/g, ' ').trim();

		return {
			success: true,
			comment: cleanFeedback,
			position:{
				line: params.range.start.line +1,
				character:0
			}
		};
	} catch (error) {
		connection.console.error("Error sending data to LLM: " + error);
		return {success: false, error: 'Error sending data to LLM'}
	}
})


connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
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
		globalSettings = (
			(change.settings.languageServerExample || defaultSettings)
		);
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
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});


connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
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
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnostic);
	}
	return diagnostics;
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		connection.console.log("Completion requested at:");
		return [
			//create list structure
			{
				label: 'Yaml',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'data',
				kind: CompletionItemKind.Text,
				data: 2
			},
			{
				label: 'prompt',
				kind: CompletionItemKind.Text,
				data: 3
			},
			{
				label: '# send-to-llm',
				kind: CompletionItemKind.Text,
				data: 4
			}
		];
	}
);
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'Yaml details';
			item.documentation = "Yaml Docs";
		}
		else if (item.data === 2) {
			item.detail = 'Yaml array list or dict';
			item.documentation = 'Yaml documentation';
		}
		else if (item.data === 3) {
			item.detail = 'Prompt for llm';
			item.documentation = 'LLM documention, openrouter etc';
		}
		else if (item.data === 4) {
			item.detail = 'Call to send text to llm';
		}
		return item;
		//when i get the new keywords, i want to append them to here or revise it
		//and for details i can put the comments or documentation here
	}
);


documents.listen(connection);

// Listen on the connection
connection.listen();
