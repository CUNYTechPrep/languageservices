/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
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
	const feedbackCommand = vscode.commands.registerCommand('extension.getLLMFeedback', async () =>{
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
			location:vscode.ProgressLocation.Notification,
			title: "Getting LLM Feedback",
			cancellable: false
		}, async () => {
			try{
				const response = await client.sendRequest<{
					success: boolean;
					comment?: string;
					replaceSelection?: boolean;
					replacement?: string;
					position?: {
						line: number;
						character: number;
					};
				}>('llm-feedback.insertComment',{
					uri: editor.document.uri.toString(),
					range:selection,
					text:text
				});
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
							const commentText= `\n${indent}# LLM Feedback: ${response.comment}\n`
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
			const response = await client.sendRequest<{
				success: boolean;
				keywords?: Array<{key_word: string, value_type: any}>;
				error?: string;
			}>('llm-schema.extractKeywords', {
				schema: placeholderSchema
			});
			if (response.success) {
				vscode.window.showInformationMessage(
				  `Extracted ${response.keywords.length} total keywords from JSON schema`
				);
				
				console.log("Keywords:", response.keywords);
			  } else {
				vscode.window.showErrorMessage("Failed to extract keywords");
			  }
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error.message}`);
		}
	});
	console.log("Extension activating...");
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    statusBarItem.text = '$(sparkle) Get LLM Feedback';
    statusBarItem.command = 'extension.getLLMFeedback';
    context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			statusBarItem.show();
		})
	);
    console.log("Status bar item created"); // Confirm this logs

	const schemaButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
	schemaButton.text = "$(symbol-keyword) Schema-based Querying";
	schemaButton.command = 'extension.sendSchemaKeywordsToLLM';
	schemaButton.show();
	context.subscriptions.push(schemaButton);

	context.subscriptions.push(
		client,feedbackCommand, statusBarItem
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
