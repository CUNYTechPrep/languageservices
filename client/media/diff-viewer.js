const vscode = acquireVsCodeApi();

let currentData = null;

// Listen for messages from the extension
window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'updateDiff':
			updateDiffContent(message.data);
			break;
	}
});

function updateDiffContent(data) {
	currentData = data;

	document.getElementById('fileName').textContent = data.fileName || 'Untitled';
	document.getElementById('originalContent').textContent = data.original || '';
	document.getElementById('modifiedContent').textContent = data.modified || '';
}

function acceptChanges() {
	if (currentData) {
		vscode.postMessage({
			command: 'accept',
			data: {
				modifiedContent: currentData.modified,
			},
		});
	}
}

function rejectChanges() {
	vscode.postMessage({
		command: 'reject',
	});
}

// Set up event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
	const acceptBtn = document.getElementById('acceptBtn');
	const rejectBtn = document.getElementById('rejectBtn');

	if (acceptBtn) {
		acceptBtn.addEventListener('click', acceptChanges);
	}

	if (rejectBtn) {
		rejectBtn.addEventListener('click', rejectChanges);
	}
});

// Notify extension that webview is ready
vscode.postMessage({
	command: 'ready',
});
