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
import completions from './completions.json';
import fs from 'fs';
import path from 'path';

const OPENROUTER_KEY = process.env.OPENROUTER_KEY;;
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

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
	console.log(params.text);
	const doc = documents.get(params.uri);
	if(!doc){
		return {success: false, error: 'Document not found'};
	}
	try{
		const llmPrompt = `
				1.Convert the following prompts into a YAML format that uses a pseudo code that you can interpret precisely.
				2.Evaluate the YAML and write any improvements and extensions.
				3.Revise the original YAML to include all the improvements and extension you suggested with comments.
				4.Extract all the keywords used in the YAML specification and list them, explaining how each is to be used.
				Return prompt 3 and 4 only. Prompt 4 should have the keywords in json format, keywords{word:,explanation:}. Return the json schema to validate the YAML file
				`.trim();
				//Key words should soon be returned as well, probably in a list or tuple format. These can be used to to replace the existing ones
			
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers:{
				"Authorization": "Bearer "+OPENROUTER_KEY,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				"model": "qwen/qwen2.5-vl-3b-instruct:free", // Model chnaged to meta maverick
				"messages": [
					{
						"role": "user",
						"content": `${params.text}\n${llmPrompt}` // Send prompt and data from YAML` // Send prompt and data from YAML
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
		const result = await response.json() as OpenAIResponse;
		connection.console.log("LLM Prompt:" + `${params.text}\n${llmPrompt}`);
		
		connection.console.log("LLM Response:"+ JSON.stringify(result,null,2));
		//connection.console.log("LLM Response:"+ result.choices[0].message.content);
		const feedback = result.choices[0].message.content;
		extractKeywordsFromLLMResponse(feedback);

		//const cleanFeedback = feedback.replace(/\n/g, ' ').trim();
		   

		return {
			success: true,
			comment: feedback,
			position:{
				line: params.range.start.line +1,
				character:0
			}
		};
	} catch (error) {
		connection.console.error("Error sending data to LLM: " + error);
		return {success: false, error: 'Error sending data to LLM'};
	}
});


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
type myCompletionItem = {
	label: string;
	data: string;
	index: number;
};
// This handler provides the initial list of the completion items.
const completionsPath = path.join(__dirname, 'completions.json');
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		//connection.console.log("Completion requested at:");
		const raw = fs.readFileSync(completionsPath, 'utf-8');
		const completions: myCompletionItem[] = JSON.parse(raw);
		
		//connection.console.log(raw);
		return completions.map(item => ({
			...item,
			kind: CompletionItemKind.Text, //injects the type of completion
			detail: `${item.data}`, // shows inline on select
		  }));
		/*return [
			{
				label: '# send-to-llm',
				data: 1
			}
		];*/
	}
);

//Overwrites current completions file with the new keywords
export function addCompletionItems(newItems: myCompletionItem[]) {
	fs.writeFileSync(completionsPath, JSON.stringify(newItems, null, 2), 'utf-8');
}

//function to get json from string llm response
export async function extractKeywordsFromLLMResponse(llmResponse: string) {
	const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/);
	if (!jsonMatch) {
	  throw new Error("No JSON block found in LLM response.");
	}
  
	const jsonString = jsonMatch[1];
	const parsed = JSON.parse(jsonString);
  
	const newItems: myCompletionItem[] = Object.entries(parsed).map(([label, value], index) => ({
		label,
		data: typeof value === 'string' ? value : JSON.stringify(value),
		index: index + 1
	  }));
	  const preview = newItems.map(item => `• ${item.label}: ${item.data}`).join('\n');
	  connection.console.log("Previewing new completions:\n" + preview);
	
	  // Ask user to confirm using buttons
	  const selection = await connection.window.showInformationMessage(
		"Do you want to update completions with these new items?",
		{ title: "Yes" },
		{ title: "No" }
	  );
	
	  if (selection?.title === "Yes") {
		addCompletionItems(newItems);
		connection.console.log("✅ Completions updated.");
	  } else {
		connection.console.log("❌ Completions update canceled.");
	  }
}

//Without this method an error occurs, must have an onCompletionResolve even though Connection.onCompletion takes care of autocomplete
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		return item;
		/*if (item.data === 1) {
			item.detail = 'Yaml details';
			item.documentation = "Yaml Docs";
		}*/
	}
);
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
