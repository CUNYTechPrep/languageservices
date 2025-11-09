import * as vscode from 'vscode';

interface TestResultsData {
	workflowName: string;
	timestamp: string;
	steps: {
		name: string;
		output: string;
	}[];
	totalSteps: number;
}

export class TestResultsWebviewProvider {
	public static currentPanel: TestResultsWebviewProvider | undefined;
	public static readonly viewType = 'testResultsViewer';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, testResultsData: TestResultsData) {
		const column = vscode.ViewColumn.Two;

		// If we already have a panel, show it and update content
		if (TestResultsWebviewProvider.currentPanel) {
			TestResultsWebviewProvider.currentPanel._panel.reveal(column);
			TestResultsWebviewProvider.currentPanel._updateContent(testResultsData);
			return;
		}

		// Otherwise, create a new panel
		const panel = vscode.window.createWebviewPanel(
			TestResultsWebviewProvider.viewType,
			'Test Results',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'client', 'media')],
			}
		);

		TestResultsWebviewProvider.currentPanel = new TestResultsWebviewProvider(
			panel,
			extensionUri
		);
		TestResultsWebviewProvider.currentPanel._updateContent(testResultsData);
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
			async message => {
				switch (message.command) {
					case 'copyStep':
						await vscode.env.clipboard.writeText(message.content);
						vscode.window.showInformationMessage('Step output copied to clipboard');
						break;
					case 'ready':
						// Webview is ready
						break;
				}
			},
			null,
			this._disposables
		);
	}

	private _testResultsData: TestResultsData | undefined;

	private _updateContent(testResultsData: TestResultsData) {
		this._testResultsData = testResultsData;
		// Send updated content to the webview
		this._panel.webview.postMessage({
			command: 'updateResults',
			data: testResultsData,
		});
	}

	private _getHtmlForWebview(): string {
		const styleUri = this._panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'client', 'media', 'test-results.css')
		);
		const scriptUri = this._panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'client', 'media', 'test-results.js')
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src ${this._panel.webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Test Results</title>
</head>
<body>
    <div id="app">
        <div class="tabs">
            <button class="tab-button active" data-tab="overview">Overview</button>
            <button class="tab-button" data-tab="steps">Steps</button>
        </div>
        
        <div class="tab-content">
            <div id="overview-tab" class="tab-pane active">
                <h2>Workflow Test Results</h2>
                <div class="overview-section">
                    <div class="info-card">
                        <div class="info-label">Workflow Name</div>
                        <div class="info-value" id="workflow-name">Loading...</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Timestamp</div>
                        <div class="info-value" id="timestamp">Loading...</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Total Steps</div>
                        <div class="info-value" id="total-steps">0</div>
                    </div>
                </div>
                <div class="summary-section">
                    <h3>Execution Summary</h3>
                    <div id="summary-details">
                        <p>All steps executed successfully</p>
                    </div>
                </div>
            </div>
            
            <div id="steps-tab" class="tab-pane">
                <h2>Step Results</h2>
                <div id="steps-container">
                    <!-- Steps will be dynamically added here -->
                </div>
            </div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
	}

	public dispose() {
		TestResultsWebviewProvider.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}
