import openRouterClient, { OpenRouterRequest } from './llm/OpenRouterClient';
import { parse } from 'yaml';

// Utility function to sleep/wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Exponential backoff retry wrapper
async function callWithRetry(
	fn: () => Promise<any>,
	maxRetries = 3,
	baseDelay = 1000
): Promise<any> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error: any) {
			const isRateLimitError =
				error?.message?.includes('too quickly') ||
				error?.message?.includes('rate limit') ||
				error?.message?.includes('429');

			if (!isRateLimitError || attempt === maxRetries) {
				throw error;
			}

			// Exponential backoff: 1s, 2s, 4s, 8s...
			const delay = baseDelay * Math.pow(2, attempt);
			console.log(
				`Rate limit hit. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
			);
			await sleep(delay);
		}
	}
}

export class YamlExecutor {
	async mockTestYamlScript(yamlScript: string): Promise<string> {
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
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [{ role: 'user', content: prompt }],
			};

			// Use retry logic with exponential backoff
			const response = await callWithRetry(async () => {
				return await openRouterClient.callAPI('chat/completions', request);
			});

			const content = response.choices[0].message?.content || '';
			console.log(content);
			return content;
		} catch (error) {
			console.log(error);
			return '';
		}
	}

	async testYamlWithPromptChaining(yamlScript: string): Promise<Record<string, string>> {
		try {
			const doc = parse(yamlScript) as any;

			if (!doc || !doc.steps || !Array.isArray(doc.steps)) {
				throw new Error('YAML must include a top-level `steps` array');
			}

			const outputs: Record<string, string> = {};
			// Accumulate a simple context object to pass previous outputs
			for (let i = 0; i < doc.steps.length; i++) {
				const step = doc.steps[i];
				const stepName = step?.Step || step?.name || `step-${i + 1}`;

				console.log(`Executing step: ${stepName}`);
				console.log('Step details:', JSON.stringify(step, null, 2));
				console.log('Current outputs:', JSON.stringify(outputs, null, 2));

				// Add delay between steps to avoid rate limiting (except for first step)
				if (i > 0) {
					const delayMs = 2000; // 2 second delay between steps
					console.log(`Waiting ${delayMs}ms before next request...`);
					await sleep(delayMs);
				}

				// Build a prompt for this step, including previous outputs as context
				const prompt = `
                    You are executing a single step from a YAML workflow. Execute the step below and produce only the requested deliverable (no explanations).
                    Step (${stepName}):
                    ${JSON.stringify(step, null, 2)}
                    Context - outputs from previous steps:
                    ${JSON.stringify(outputs, null, 2)}
                    Follow the step's intent and produce the deliverable described.
                `;

				const request: OpenRouterRequest = {
					model: 'deepseek/deepseek-chat-v3.1:free',
					models: ['qwen/qwen3-coder:free', 'deepseek/deepseek-r1-0528-qwen3-8b:free'],
					messages: [{ role: 'user', content: prompt }],
				};

				// Use retry logic with exponential backoff
				const response = await callWithRetry(async () => {
					return await openRouterClient.callAPI('chat/completions', request);
				});

				const content = response.choices[0].message?.content || '';

				// Log the output for now as requested
				console.log(`Step output (${stepName}):`, content);

				outputs[stepName] = content;
			}

			return outputs;
		} catch (error) {
			console.log('Error executing YAML prompt chain:', error);
			throw error;
		}
	}
}

const yamlExecutor = new YamlExecutor();
export default yamlExecutor;
