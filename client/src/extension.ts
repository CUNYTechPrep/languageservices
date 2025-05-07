/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext } from 'vscode';
import * as vscode from 'vscode'
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'yaml' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
		serverOptions,
		clientOptions
	);

	// status bars for each keyword for script
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
	statusBarItem.text = '$(sparkle) Get LLM Feedback';
	statusBarItem.command = 'extension.getLLMFeedback';

	const schemaButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
	schemaButton.text = "$(symbol-keyword) Schema-based Querying";
	schemaButton.command = 'extension.sendSchemaKeywordsToLLM';

	const actionsButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 998);
	actionsButton.text = "$(play) Execute YAML Actions";
	actionsButton.command = 'extension.executeYamlActions';

	const replaceVariableStatusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		2000
	);
	replaceVariableStatusBarItem.text = "$(sparkle) Replace Variable";
	replaceVariableStatusBarItem.command = "extension.replaceVariable";

	const loadJSONContextFile = (): Record<string, any> => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return {};
		}

		const contextFilePath = path.join(workspaceFolders[0].uri.fsPath, "context.json");

		if (!fs.existsSync(contextFilePath)) {
			return {};
		}

		try {
			const data = fs.readFileSync(contextFilePath, "utf8");
			return JSON.parse(data);
		} catch (error) {
			console.error("Error reading context.json:", error);
			vscode.window.showErrorMessage("Error reading context.json: " + error.message);
			return {};
		}
	};

	const feedbackCommand = vscode.commands.registerCommand('extension.getLLMFeedback', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		const selection = editor.selection;
		const text = editor.document.getText(selection);
		if (!text) {
			vscode.window.showErrorMessage('No text selected.');
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Getting LLM Feedback",
			cancellable: false
		}, async () => {
			try {
				const response = await client.sendRequest<{
					success: boolean;
					comment?: string;
					replaceSelection?: boolean;
					replacement?: string;
					position?: {
						line: number;
						character: number;
					};
				}>('llm-feedback.insertComment', {
					uri: editor.document.uri.toString(),
					range: selection,
					text: text
				});
				console.log(response)
				if (response.success) {
					if (response.replaceSelection && response.replacement) {
						await editor.edit(editBuilder => {
							editBuilder.replace(selection, response.replacement);
						});
					} else if (response.comment) {
						await editor.edit(editBuilder => {
							const line = response.position !== undefined ?
								response.position.line :
								selection.end.line + 1;
							const position = new vscode.Position(line, 0);
							const currentLine = editor.document.lineAt(selection.start.line)
							const indent = currentLine.text.match(/^\s*/)?.[0] || '';
							const commentText = `\n${indent}# LLM Feedback: ${response.comment}\n`
							editBuilder.insert(position, commentText);
						});
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage('Error getting LLM feedback: ' + error.message);
			}
		})
	})

	const sendSchemaKeywordsCommand = vscode.commands.registerCommand('extension.sendSchemaKeywordsToLLM', async () => {
		try {
			const placeholderSchema = {
				"properties": {
					"prompt": {
						"type": "string",
						"description": "Instructions for the LLM"
					},
					"data": {
						"type": "string",
						"description": "Content to be computed, associated with the given prompt"
					},
					"correct": {
						"type": "boolean",
						"description": "When set to true, LLM will correct given data and directly replace original data"
					}
				}
			};
			let yamlText = undefined;
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'yaml') {
				yamlText = editor.document.getText();
			}
			const response = await client.sendRequest<{
				success: boolean;
				keywords?: Array<{ key_word: string, value_type: any, appearsInYaml?: boolean }>;
				error?: string;
			}>('llm-schema.extractKeywords', {
				schema: placeholderSchema,
				yamlText: yamlText
			});
			if (response.success) {
				const usedKeywords = response.keywords.filter(k => k.appearsInYaml).length;
				vscode.window.showInformationMessage(
					`Extracted ${usedKeywords} total keywords from JSON schema`
				);

				console.log("Keywords:", response.keywords);
			} else {
				vscode.window.showErrorMessage("Failed to extract keywords");
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error.message}`);
		}
	});

	const replaceVariableCommand = vscode.commands.registerCommand("extension.replaceVariable", async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor found.");
			return;
		}
		const text = editor.document.getText();
		const context = loadJSONContextFile();

		if (!text) {
			vscode.window.showErrorMessage("No text in file.");
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Replacing Variable",
			cancellable: false,
		}, async () => {
			try {
				const response = await client.sendRequest<{
					success: boolean;
					modifiedText?: string;
					error?: string;
				}>("yaml.replaceVariable", {
					uri: editor.document.uri.toString(),
					text: text,
					context: context,
				});

				if (response.success && response.modifiedText) {
					console.log("🔁 Full replaced YAML content:\n", response.modifiedText);
					vscode.window.showInformationMessage("Full YAML replacement logged to console.");
				} else if (response.error) {
					console.error("Error in response:", response.error);
					vscode.window.showErrorMessage("Error replacing variable: " + response.error);
				} else {
					vscode.window.showWarningMessage("No replacement text returned.");
				}
			} catch (error) {
				vscode.window.showErrorMessage("Error replacing variable: " + error.message);
			}
		});
	});

	// connect executeYamlActions (scripting)
	const executeYamlActionsCommand = vscode.commands.registerCommand('extension.executeYamlActions', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		let yamlText;
		const selection = editor.selection;
		if (selection && !selection.isEmpty) {
			yamlText = editor.document.getText(selection);
		} else {
			yamlText = editor.document.getText();
		}

		if (!yamlText) {
			vscode.window.showErrorMessage('No YAML content found.');
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Executing YAML Actions",
			cancellable: true
		}, async (progress, token) => {
			try {
				const response = await client.sendRequest<{
					success: boolean;
					results?: any[];
					llmResult?: string;
					correctedData?: string;
					context?: any;
					error?: string;
				}>('yaml-actions.execute', {
					yamlText: yamlText
				});

				if (response.success) {
					const outputChannel = vscode.window.createOutputChannel("YAML Actions");
					outputChannel.clear();
					outputChannel.appendLine("YAML Action Results:");
					outputChannel.appendLine(JSON.stringify(response.results, null, 2));

					if (response.llmResult) {
						await editor.edit(editBuilder => {
							const position = editor.document.lineAt(
								editor.document.lineCount - 1
							).range.end;
							const resultText = `\n\n# Action Result:\n# ${response.llmResult}\n`;
							editBuilder.insert(position, resultText);
						});

						vscode.window.showInformationMessage("YAML actions executed successfully");
						outputChannel.appendLine("\nLLM Result:");
						outputChannel.appendLine(response.llmResult);
					} else {
						vscode.window.showInformationMessage("YAML actions executed (no LLM result)");
					}

					outputChannel.show();
				} else {
					vscode.window.showErrorMessage("Failed to execute YAML actions: " +
						(response.error || "Unknown error"));
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Error executing YAML actions: ${error.message}`);
			}
		});
	});
	actionsButton.text = "$(play) Execute YAML Actions";
	actionsButton.command = 'extension.executeYamlActions';
	actionsButton.show();

	statusBarItem.show();
	schemaButton.show();
	actionsButton.show();
	replaceVariableStatusBarItem.show();

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				statusBarItem.show();
			}
		})
	);

	context.subscriptions.push(
		client,
		feedbackCommand,
		sendSchemaKeywordsCommand,
		replaceVariableCommand,
		executeYamlActionsCommand,
		statusBarItem,
		schemaButton,
		actionsButton,
		replaceVariableStatusBarItem
	  );

	console.log("Extension activating...");
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			statusBarItem.show();
		})
	);
	console.log("Status bar item created"); // Confirm this logs

	schemaButton.show();
	context.subscriptions.push(schemaButton);

	replaceVariableStatusBarItem.show();
	context.subscriptions.push(replaceVariableStatusBarItem);

	vscode.commands.executeCommand('setContext', 'hasSelection', true);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
