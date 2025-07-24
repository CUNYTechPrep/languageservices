import * as vscode from "vscode";

interface DiffData {
  original: string;
  modified: string;
  targetFile: vscode.Uri;
  fileName: string;
}

export class DiffWebviewProvider {
  public static currentPanel: DiffWebviewProvider | undefined;
  public static readonly viewType = "diffViewer";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, diffData: DiffData) {
    const column = vscode.ViewColumn.One;

    // If we already have a panel, show it and update content
    if (DiffWebviewProvider.currentPanel) {
      DiffWebviewProvider.currentPanel._panel.reveal(column);
      DiffWebviewProvider.currentPanel._updateContent(diffData);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      DiffWebviewProvider.viewType,
      "Diff Viewer",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "client", "media"),
        ],
      }
    );

    DiffWebviewProvider.currentPanel = new DiffWebviewProvider(
      panel,
      extensionUri
    );
    DiffWebviewProvider.currentPanel._updateContent(diffData);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "accept":
            await this._acceptChanges(message.data);
            break;
          case "reject":
            this._panel.dispose();
            vscode.window.showInformationMessage("Changes rejected");
            break;
          case "ready":
            // Webview is ready, can send initial data if needed
            break;
        }
      },
      null,
      this._disposables
    );
  }
  private _diffData: DiffData | undefined;
  private _updateContent(diffData: DiffData) {
    this._diffData = diffData;
    // Send updated content to the webview
    this._panel.webview.postMessage({
      command: "updateDiff",
      data: {
        original: diffData.original,
        modified: diffData.modified,
        fileName: diffData.fileName,
      },
    });
  }

  private async _acceptChanges(data: { modifiedContent?: string }) {
    try {
      console.log("Applying changes to file:", data);
      // Get or open the target document
      const document = await vscode.workspace.openTextDocument(
        this._diffData.targetFile
      );
      const editor = await vscode.window.showTextDocument(document);

      // Use the modified content from the message data
      const modifiedContent = data.modifiedContent || this._diffData.modified;

      // Apply the changes
      await editor.edit((editBuilder) => {
        const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
        editBuilder.replace(fullRange, modifiedContent);
      });

      // Save the document
      await document.save();

      // Close the diff panel
      this._panel.dispose();

      vscode.window.showInformationMessage("Changes applied successfully!");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to apply changes: ${error}`);
    }
  }

  public dispose() {
    DiffWebviewProvider.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(): string {
    // Get paths to resource files
    const styleUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "client",
        "media",
        "diff-viewer.css"
      )
    );
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "client",
        "media",
        "diff-viewer.js"
      )
    );

    // Use a nonce for script security
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>Prompt Diff Viewer</title>
    <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
    <div class="header">
        <div class="file-name" id="fileName">Loading...</div>
        <div class="actions">
            <button class="btn btn-accept" id="acceptBtn">Accept Changes</button>
            <button class="btn btn-reject" id="rejectBtn">Reject</button>
        </div>
    </div>
    
    <div class="diff-container">
        <div class="diff-side">
            <div class="diff-header">Original</div>
            <div class="diff-content" id="originalContent">
                <div class="loading">Loading original content...</div>
            </div>
        </div>
        <div class="diff-side">
            <div class="diff-header">Modified</div>
            <div class="diff-content" id="modifiedContent">
                <div class="loading">Loading modified content...</div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
