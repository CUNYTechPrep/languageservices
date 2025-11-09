(function () {
	const vscode = acquireVsCodeApi();

	// Tab switching
	function setupTabs() {
		const tabButtons = document.querySelectorAll('.tab-button');
		const tabPanes = document.querySelectorAll('.tab-pane');

		tabButtons.forEach(button => {
			button.addEventListener('click', () => {
				const targetTab = button.getAttribute('data-tab');

				// Remove active class from all buttons and panes
				tabButtons.forEach(btn => btn.classList.remove('active'));
				tabPanes.forEach(pane => pane.classList.remove('active'));

				// Add active class to clicked button and corresponding pane
				button.classList.add('active');
				const targetPane = document.getElementById(`${targetTab}-tab`);
				if (targetPane) {
					targetPane.classList.add('active');
				}
			});
		});
	}

	// Update overview tab
	function updateOverview(data) {
		document.getElementById('workflow-name').textContent =
			data.workflowName || 'Unnamed Workflow';
		document.getElementById('timestamp').textContent =
			data.timestamp || new Date().toLocaleString();
		document.getElementById('total-steps').textContent = data.totalSteps || 0;

		const summaryDetails = document.getElementById('summary-details');
		if (summaryDetails) {
			summaryDetails.innerHTML = `
                <p><strong>Execution Status:</strong> Completed</p>
                <p><strong>Steps Executed:</strong> ${data.totalSteps || 0}</p>
                <p><strong>All steps executed successfully</strong></p>
            `;
		}
	}

	// Update steps tab
	function updateSteps(data) {
		const stepsContainer = document.getElementById('steps-container');
		if (!stepsContainer) return;

		if (!data.steps || data.steps.length === 0) {
			stepsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No Steps Found</h3>
                    <p>No steps were executed in this workflow.</p>
                </div>
            `;
			return;
		}

		stepsContainer.innerHTML = '';

		data.steps.forEach((step, index) => {
			const stepItem = document.createElement('div');
			stepItem.className = 'step-item';

			const stepHeader = document.createElement('div');
			stepHeader.className = 'step-header';

			const stepName = document.createElement('div');
			stepName.className = 'step-name';
			stepName.innerHTML = `
                <span class="step-number">${index + 1}</span>
                <span>${escapeHtml(step.name)}</span>
                <span class="expand-icon">▶</span>
            `;

			const stepActions = document.createElement('div');
			stepActions.className = 'step-actions';

			const copyButton = document.createElement('button');
			copyButton.className = 'copy-button';
			copyButton.textContent = 'Copy';
			copyButton.addEventListener('click', e => {
				e.stopPropagation();
				vscode.postMessage({
					command: 'copyStep',
					content: step.output,
				});
			});

			stepActions.appendChild(copyButton);
			stepHeader.appendChild(stepName);
			stepHeader.appendChild(stepActions);

			const stepContent = document.createElement('div');
			stepContent.className = 'step-content';

			const stepOutput = document.createElement('div');
			stepOutput.className = 'step-output';
			stepOutput.textContent = step.output || '(No output)';

			stepContent.appendChild(stepOutput);

			stepItem.appendChild(stepHeader);
			stepItem.appendChild(stepContent);
			stepsContainer.appendChild(stepItem);

			// Toggle expand/collapse
			stepHeader.addEventListener('click', () => {
				const isExpanded = stepContent.classList.contains('expanded');
				const expandIcon = stepName.querySelector('.expand-icon');

				if (isExpanded) {
					stepContent.classList.remove('expanded');
					expandIcon.classList.remove('expanded');
				} else {
					stepContent.classList.add('expanded');
					expandIcon.classList.add('expanded');
				}
			});
		});
	}

	// Escape HTML to prevent XSS
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	// Handle messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;
		switch (message.command) {
			case 'updateResults':
				updateOverview(message.data);
				updateSteps(message.data);
				break;
		}
	});

	// Initialize tabs
	setupTabs();

	// Notify extension that webview is ready
	vscode.postMessage({ command: 'ready' });
})();
