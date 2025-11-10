/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from 'vscode-languageclient/node';

import { DiffWebviewProvider } from './WebviewProvider';
import { TestResultsWebviewProvider } from './TestResultsWebviewProvider';

// Constants
const EXTENSION_ID = 'languageServerExample';
const EXTENSION_NAME = 'Language Server Example';

// Helper function for safe error message extraction
function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'yaml' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: [
				workspace.createFileSystemWatcher('**/.clientrc'),
				workspace.createFileSystemWatcher('**/*.vars.yaml'),
			],
		},
	};

	// Create the language client and start the client.
	client = new LanguageClient(EXTENSION_ID, EXTENSION_NAME, serverOptions, clientOptions);

	// status bars for each keyword for script
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
	statusBarItem.text = '$(sparkle) Get LLM Feedback';
	statusBarItem.command = 'extension.getLLMFeedback';

	const feedbackCommand = vscode.commands.registerCommand(
		'extension.getLLMFeedback',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Getting LLM Feedback',
					cancellable: false,
				},
				async () => {
					try {
						const response = await client.sendRequest<{
							success: boolean;
							refinedPrompt?: string;
							error?: string;
						}>('prompt.refine', {
							uri: editor.document.uri.toString(),
						});

						if (!response.success || response.error) {
							vscode.window.showErrorMessage('Error getting LLM feedback');
							return;
						}
						const originalText = editor.document.getText();
						const commentText = response.refinedPrompt
							? `${response.refinedPrompt}`
							: '';
						DiffWebviewProvider.createOrShow(context.extensionUri, {
							original: originalText,
							modified: commentText || originalText,
							targetFile: editor.document.uri,
							fileName: editor.document.fileName,
						});
					} catch (error) {
						vscode.window.showErrorMessage(
							'Error getting LLM feedback: ' + getErrorMessage(error)
						);
						return;
					}
				}
			);
		}
	);
	const generateYamlScriptCommand = vscode.commands.registerCommand(
		'extension.generateYamlScript',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Creating Yaml Script',
					cancellable: false,
				},
				async () => {
					try {
						const response = await client.sendRequest<{
							success: boolean;
							yamlScript?: string;
							schema?: Record<string, unknown>;
							error?: string;
						}>('script.getScript', {
							uri: editor.document.uri.toString(),
						});

						if (!response.success || response.error) {
							vscode.window.showErrorMessage('Error getting YAML Script');
							return;
						}

						const originalText = editor.document.getText();
						const commentText = response.yamlScript ? `${response.yamlScript}` : '';
						DiffWebviewProvider.createOrShow(context.extensionUri, {
							original: originalText,
							modified: commentText || originalText,
							targetFile: editor.document.uri,
							fileName: editor.document.fileName,
							schema: response.schema,
						});

						if (response.schema) {
							vscode.window.showInformationMessage(
								'Schema returned and saved to workspace as workflow.schema.json'
							);
						}
					} catch (error) {
						vscode.window.showErrorMessage(
							'Error generating YAML script: ' + getErrorMessage(error)
						);
						return;
					}
				}
			);
		}
	);
	const refineYamlScriptCommand = vscode.commands.registerCommand(
		'extension.refineYamlScript',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return;
			}

			const userInput = await vscode.window.showInputBox({
				prompt: 'Enter text to guide the refinement (optional):',
				placeHolder: 'e.g., "Make this script more concise" or "Add a step for logging"',
			});

			// If the user cancels the input box, userInput will be undefined
			if (userInput === undefined) {
				vscode.window.showInformationMessage('Refinement cancelled.');
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Refining Yaml Script',
					cancellable: false,
				},
				async () => {
					try {
						const response = await client.sendRequest<{
							success: boolean;
							yamlScript?: string;
							schema?: Record<string, unknown>;
							error?: string;
						}>('script.refine', {
							uri: editor.document.uri.toString(),
							prompt: userInput,
						});

						if (!response.success || response.error) {
							vscode.window.showErrorMessage('Error refining YAML Script');
							return;
						}

						const originalText = editor.document.getText();
						const commentText = response.yamlScript ? `${response.yamlScript}` : '';
						DiffWebviewProvider.createOrShow(context.extensionUri, {
							original: originalText,
							modified: commentText || originalText,
							targetFile: editor.document.uri,
							fileName: editor.document.fileName,
							schema: response.schema,
						});

						if (response.schema) {
							vscode.window.showInformationMessage(
								'Refined schema returned and saved to workspace as workflow.schema.json'
							);
						}
					} catch (error) {
						vscode.window.showErrorMessage(
							'Error refining YAML Script: ' + getErrorMessage(error)
						);
						return;
					}
				}
			);
		}
	);
	const testYamlScriptCommand = vscode.commands.registerCommand(
		'extension.testYamlScript',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Testing Yaml Script',
					cancellable: false,
				},
				async () => {
					try {
						const response = await client.sendRequest<{
							success: boolean;
							testResults?: Record<string, string>;
							error?: string;
						}>('script.test', {
							uri: editor.document.uri.toString(),
						});

						if (!response.success || response.error) {
							vscode.window.showErrorMessage('Error testing YAML Script');
							return;
						}

						// Convert testResults to the format expected by the webview
						const steps = Object.entries(response.testResults || {}).map(
							([name, output]) => ({
								name,
								output,
							})
						);

						const testResultsData = {
							workflowName: path.basename(editor.document.fileName, '.yaml'),
							timestamp: new Date().toLocaleString(),
							steps,
							totalSteps: steps.length,
						};

						// Show results in the new webview panel
						TestResultsWebviewProvider.createOrShow(
							context.extensionUri,
							testResultsData
						);
					} catch (error) {
						vscode.window.showErrorMessage(
							'Error testing YAML script: ' + getErrorMessage(error)
						);
						return;
					}
				}
			);
		}
	);

	statusBarItem.show();

	context.subscriptions.push(
		client,
		feedbackCommand,
		generateYamlScriptCommand,
		refineYamlScriptCommand,
		testYamlScriptCommand,
		statusBarItem
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(_editor => {
			statusBarItem.show();
		})
	);

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
