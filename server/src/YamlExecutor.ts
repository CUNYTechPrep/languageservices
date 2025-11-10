import openRouterClient, { OpenRouterRequest } from './llm/OpenRouterClient';
import { parse } from 'yaml';
import { LLMError, YAMLProcessingError, getErrorMessage } from './errorHandler';
import {
	YamlWorkflowDocument,
	WorkflowExecutionResult,
	WorkflowStep,
	isWorkflowStep,
} from './types';
import { RETRY_CONFIG, MODEL_CONFIG, JSON_INDENT } from './constants';

// Utility function to sleep/wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Exponential backoff retry wrapper
async function callWithRetry<T>(
	fn: () => Promise<T>,
	maxRetries = RETRY_CONFIG.MAX_RETRIES,
	baseDelay = RETRY_CONFIG.BASE_DELAY_MS
): Promise<T> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error: unknown) {
			// Check if this is a rate limit error using LLMError methods
			const isRateLimitError =
				error instanceof LLMError
					? error.isRateLimitError()
					: (error as Error)?.message?.includes('too quickly') ||
						(error as Error)?.message?.includes('rate limit') ||
						(error as Error)?.message?.includes('429');

			// If it's not a rate limit error or we're out of retries, throw
			if (!isRateLimitError || attempt === maxRetries) {
				throw error;
			}

			// Exponential backoff: 1s, 2s, 4s, 8s...
			const delay = baseDelay * Math.pow(2, attempt);
			// This is informational logging for retry logic, console is acceptable here
			console.info(
				`Rate limit hit. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
			);
			await sleep(delay);
		}
	}
	// TypeScript exhaustiveness check - should never reach here
	throw new Error('Retry logic exhausted without throwing');
}

export class YamlExecutor {
	async mockTestYamlScript(yamlScript: string): Promise<string> {
		if (!yamlScript || yamlScript.trim().length === 0) {
			throw new YAMLProcessingError('Cannot execute empty YAML script');
		}

		try {
			const prompt = `
				You are a YAML DSL interpreter that executes YAML scripts written in a domain-specific workflow language.  
				Each YAML file defines a workflow using **human-friendly, domain-specific keywords** (e.g., 'Search', 'Exercise', 'Campaign') rather than rigid config fields.  

				Your task:  
				- Read the YAML workflow.  
				- Interpret each step in order.  
				- Generate the deliverables described (code, text, files, or structured data).  

				Execution rules:  
				1. Identify each step by its 'Step' name.  
				2. Read the **domain-specific keywords** inside the step (e.g., 'Search', 'Exercise', 'Routine', 'Summarize').  
				- Treat these as the **action definitions**.  
				3. Use the keyword's parameters ('Query', 'Sources', 'Duration', 'Audience', etc.) as the **context for generation**.  
				4. If present, honor workflow modifiers:
				- 'Produce' → define the outputs to generate.  
				- 'After' → run only after the referenced step succeeds.  
				- 'If fails' → handle errors by applying the fallback instruction.  
				5. Validate that each step produced the expected deliverable before continuing.  
				6. Continue until the workflow completes.  

				Important:  
				- The DSL may differ between domains. Always respect the keywords as written.  
				- Interpret the script in a **machine-readable but human-friendly** way, like a mini programming language.  
				- Output only the requested deliverables — no explanations.

				YAML Script:
				${yamlScript}
			`;
			const request: OpenRouterRequest = {
				model: MODEL_CONFIG.YAML_EXECUTOR_PRIMARY,
				models: [...MODEL_CONFIG.YAML_EXECUTOR_FALLBACKS],
				messages: [{ role: 'user', content: prompt }],
			};

			// Use retry logic with exponential backoff
			const response = await callWithRetry(async () => {
				return await openRouterClient.callAPI('chat/completions', request);
			});

			const content = response.choices[0].message?.content || '';

			if (!content || content.trim().length === 0) {
				throw new YAMLProcessingError('LLM returned empty response for YAML execution');
			}

			return content;
		} catch (error) {
			if (error instanceof LLMError || error instanceof YAMLProcessingError) {
				throw error;
			}
			const message = getErrorMessage(error);
			throw new YAMLProcessingError(
				`Failed to execute YAML script: ${message}`,
				error as Error
			);
		}
	}

	async testYamlWithPromptChaining(yamlScript: string): Promise<Record<string, string>> {
		if (!yamlScript || yamlScript.trim().length === 0) {
			throw new YAMLProcessingError('Cannot test empty YAML script');
		}

		try {
			const doc = parse(yamlScript) as YamlWorkflowDocument;

			if (!doc || !doc.steps || !Array.isArray(doc.steps)) {
				throw new YAMLProcessingError('YAML must include a top-level `steps` array');
			}

			const outputs: WorkflowExecutionResult = {};

			// Accumulate a simple context object to pass previous outputs
			for (let i = 0; i < doc.steps.length; i++) {
				const stepData: WorkflowStep = doc.steps[i];

				// Validate step structure
				if (!isWorkflowStep(stepData)) {
					throw new YAMLProcessingError(`Invalid step structure at index ${i}`);
				}

				const stepName = stepData.Step || stepData.name || `step-${i + 1}`;

				// Info logging for workflow execution progress
				console.info(`Executing step: ${stepName}`);

				// Add delay between steps to avoid rate limiting (except for first step)
				if (i > 0) {
					console.info(`Waiting ${RETRY_CONFIG.STEP_DELAY_MS}ms before next request...`);
					await sleep(RETRY_CONFIG.STEP_DELAY_MS);
				}

				// Build a prompt for this step, including previous outputs as context
				const prompt = `
                    You are executing a single step from a YAML workflow. Execute the step below and produce only the requested deliverable (no explanations).
                    Step (${stepName}):
                    ${JSON.stringify(stepData, null, JSON_INDENT)}
                    Context - outputs from previous steps:
                    ${JSON.stringify(outputs, null, JSON_INDENT)}
                    Follow the step's intent and produce the deliverable described.
                `;

				const request: OpenRouterRequest = {
					model: MODEL_CONFIG.WORKFLOW_STEP_PRIMARY,
					models: [...MODEL_CONFIG.WORKFLOW_STEP_FALLBACKS],
					messages: [{ role: 'user', content: prompt }],
				};

				// Use retry logic with exponential backoff
				const response = await callWithRetry(async () => {
					return await openRouterClient.callAPI('chat/completions', request);
				});

				const content = response.choices[0].message?.content || '';

				if (!content || content.trim().length === 0) {
					throw new YAMLProcessingError(`Step "${stepName}" returned empty output`);
				}

				outputs[stepName] = content;
			}

			return outputs;
		} catch (error) {
			if (error instanceof LLMError || error instanceof YAMLProcessingError) {
				throw error;
			}
			const message = getErrorMessage(error);
			throw new YAMLProcessingError(
				`Error executing YAML prompt chain: ${message}`,
				error as Error
			);
		}
	}
}

const yamlExecutor = new YamlExecutor();
export default yamlExecutor;
