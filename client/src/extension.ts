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
			cancellable: true
		}, async () => {
			try{
				const response = await client.sendRequest<{
					success: boolean;
					comment?: string;
					line?: number;
				}>('llm-feedback.insertComment',{
					uri: editor.document.uri.toString(),
					range:selection,
					text:text
				});
				if(response.success && response.comment){
					console.log(response);
					await editor.edit(editBuilder => {
						
						const commentText= `#LLM Feedback:\n ${response.comment}\n###`;
						editBuilder.replace(selection,commentText);
						//const line = response.line !== undefined ?
						//	response.line :
						//	selection.end.line + 1;
						//const position = new vscode.Position(line, 0);
						//const currentLine = editor.document.lineAt(selection.start.line);
						//const indent = currentLine.text.match(/^\s*/)?.[0] || '';
						//const commentText= `\n${indent}#LLM Feedback:\n ${response.comment}\n###`;
						//editBuilder.insert(position, commentText);
					});
				}
			} catch (error) {
				vscode.window.showErrorMessage('Error getting LLM feedback:' + error.message);
			}
		});
	});
	console.log("Extension activating...");
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    statusBarItem.text = '$(sparkle) Get LLM Feedback';
    statusBarItem.command = 'extension.getLLMFeedback';
    context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			console.log(editor);
			statusBarItem.show();
		})
	);
    console.log("Status bar item created"); // Confirm this logs

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
