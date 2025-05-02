/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from "path";
import * as fs from "fs";
import { workspace, ExtensionContext } from "vscode";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );

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
    documentSelector: [{ scheme: "file", language: "yaml" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "languageServerExample",
    "Language Server Example",
    serverOptions,
    clientOptions
  );
  const feedbackCommand = vscode.commands.registerCommand(
    "extension.getLLMFeedback",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found.");
        return;
      }
      const selection = editor.selection;
      const text = editor.document.getText(selection);
      if (!text) {
        vscode.window.showErrorMessage("No text selected.");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Getting LLM Feedback",
          cancellable: false,
        },
        async () => {
          try {
            const response = await client.sendRequest<{
              success: boolean;
              comment?: string;
              line?: number;
            }>("llm-feedback.insertComment", {
              uri: editor.document.uri.toString(),
              range: selection,
              text: text,
            });
            if (response.success && response.comment) {
              console.log(response);
              await editor.edit((editBuilder) => {
                const line =
                  response.line !== undefined
                    ? response.line
                    : selection.end.line + 1;
                const position = new vscode.Position(line, 0);
                const currentLine = editor.document.lineAt(
                  selection.start.line
                );
                const indent = currentLine.text.match(/^\s*/)?.[0] || "";
                const commentText = `\n${indent}//LLM Feedback: ${response.comment}\n`;
                editBuilder.insert(position, commentText);
              });
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              "Error getting LLM feedback: " + error.message
            );
          }
        }
      );
    }
  );

  const loadJSONContextFile = (): Record<string, any> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return {};
    }

    const contextFilePath = path.join(
      workspaceFolders[0].uri.fsPath,
      "context.json"
    );

    if (!fs.existsSync(contextFilePath)) {
      return {};
    }

    try {
      const data = fs.readFileSync(contextFilePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error reading context.json:", error);
      vscode.window.showErrorMessage(
        "Error reading context.json: " + error.message
      );
      return {};
    }
  };

  const replaceVariableCommand = vscode.commands.registerCommand(
    "extension.replaceVariable",
    async () => {
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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Replacing Variable",
          cancellable: false,
        },
        async () => {
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
              console.log(
                "🔁 Full replaced YAML content:\n",
                response.modifiedText
              );
              vscode.window.showInformationMessage(
                "Full YAML replacement logged to console."
              );
            } else if (response.error) {
              console.error("Error in response:", response.error);
              vscode.window.showErrorMessage(
                "Error replacing variable: " + response.error
              );
            }
            // If the response is not successful and no error is provided, show a warning
            else {
              vscode.window.showWarningMessage("No replacement text returned.");
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              "Error replacing variable: " + error.message
            );
          }
        }
      );
    }
  );

  console.log("Extension activating...");
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1000
  );
  statusBarItem.text = "$(sparkle) Get LLM Feedback";
  statusBarItem.command = "extension.getLLMFeedback";
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      statusBarItem.show();
    })
  );
  const replaceVariableStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    2000
  );
  replaceVariableStatusBarItem.text = "$(sparkle) Replace Variable";
  replaceVariableStatusBarItem.command = "extension.replaceVariable";
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      replaceVariableStatusBarItem.show();
    })
  );
  console.log("Status bar item created"); // Confirm this logs

  context.subscriptions.push(
    client,
    feedbackCommand,
    statusBarItem,
    replaceVariableCommand
  );

  vscode.commands.executeCommand("setContext", "hasSelection", true);

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
