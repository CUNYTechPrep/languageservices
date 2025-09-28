import { LLMError } from '../errorHandler';

interface OpenRouterRequest {
	model: string;
	messages: {
		role: 'user' | 'system';
		content: string;
	}[];
	models?: string[];
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	stop?: string | string[];
}

interface OpenRouterResponse {
	choices: {
		message?: {
			role: string;
			content: string;
		};
		error?: {
			message: string;
			code: string;
		};
	}[];
}

class OpenRouterService {
	private apiKey: string;
	private apiUrl: string;

	constructor() {
		this.apiKey = process.env.OPENROUTER_KEY || '';
		this.apiUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1';
	}

	private async callAPI(
		endpoint: string,
		request: OpenRouterRequest
	): Promise<OpenRouterResponse> {
		try {
			const response = await fetch(`${this.apiUrl}/${endpoint}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(request),
			});
			if (!response.ok) {
				const error = (await response.json()) as {
					error: { message: string; code: string };
				};
				console.log(error);
				throw new LLMError(error.error.code, error.error.message);
			}
			// Parse the response as JSON
			const data = (await response.json()) as OpenRouterResponse;
			return data;
		} catch (error) {
			console.error('Error calling OpenRouter API:', error);
			throw error;
		}
	}

	private parseYamlFromCodeBlockRegex(input: string): string {
		const yamlMatch = input.match(/```yaml\s*\n?([\s\S]*?)\n?```/);

		if (!yamlMatch) {
			throw new Error('No YAML code block found');
		}

		const yamlContent = yamlMatch[1].trim();

		try {
			return yamlContent;
		} catch (error) {
			console.error('Failed to parse YAML:', error);
			throw error;
		}
	}

	async refinePrompt(prompt: string): Promise<string> {
		const metaPrompt = `
			You are a prompt engineering specialist focused on iteratively improving raw prompts.
			Your task is to refine and enhance user prompts, 
			maintaining the same output format (plain text or YAML) as the user's input.
			Your role during iterations:

			- Clarify and expand on the core objective
			- Fill in missing details or considerations
			- Improve clarity and specificity
			- Suggest enhancements the user might have overlooked
			- Remove ambiguity and vague language
			- Maintain the original input's flow and format
			- Clarify and state the task's domain if missing
			- If input is plain text, keep a paragraph style.

			Focus on improving:

			- Clarity: Make intentions and requirements crystal clear
			- Completeness: Identify and fill gaps in the original request
			- Specificity: Replace vague terms with concrete details
			- Feasibility: Ensure the request is actionable and realistic
			- Context: Add relevant domain knowledge or constraints

			Return **ONLY THE IMPROVED PROMPT** in the same format as the user's input. DO NOT RETURN **Explanations or meta-commentary**.
		`;

		const request: OpenRouterRequest = {
			model: 'deepseek/deepseek-chat-v3-0324:free',
			models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
			messages: [
				{ role: 'system', content: metaPrompt },
				{ role: 'user', content: prompt },
			],
		};

		const response = await this.callAPI('chat/completions', request);
		return response.choices[0].message?.content || '';
	}

	async createYamlScript(prompt: string): Promise<string> {
		try {
			const metaPrompt = `
				You are an AI assistant that helps design domain-specific workflow scripts.
				The user will provide:
				- A short description of their goal (plain text).
				- The target domain (e.g., fitness, marketing, research).

				Your task:
				1. Expand their description into a structured YAML workflow.
				2. Use the following conventions:
				- Output ONLY a YAML code block, no explanations.
				- Use 'version', 'domain', 'workflow' as top-level keys.
				- Use clear, consistent naming conventions.
				- Each step must have: 'id', 'action', 'description', 'inputs', and optional 'outputs' or 'depends_on'.
				- Each step must have action names like 'Summarize', 'GenerateCode', not descriptions.
				- Make each step atomic and testable.
				- Include proper error handling.
				- Ensure it is scriptable, consistent, and machine-readable.
				- Ensure the script is LLM-executable.
				- Structure for easy editing and modification.

				Return the result inside a YAML pseudo-code block.
			`;

			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [
					{ role: 'system', content: metaPrompt },
					{ role: 'user', content: prompt },
				],
			};

			const response = await this.callAPI('chat/completions', request);
			const content = response.choices[0].message?.content || '';
			const yaml = this.parseYamlFromCodeBlockRegex(content);
			console.log(yaml);
			return yaml;
		} catch (error) {
			console.log(error);
			return '';
		}
	}

	async refineYamlScript(yamlScript: string, prompt: string): Promise<string> {
		try {
			const metaPrompt = `
				You are an AI assistant that refines workflow scripts written in YAML.  
				The YAML describes domain-specific workflows that orchestrate AI actions.

				You will be given:
				- The current YAML script.
				- A refinement instruction (what to improve).

				Your tasks:
				1. Analyze the YAML for vague, missing, or incorrect elements.  
				2. Apply the user's refinement instruction.  
				3. Ensure the YAML is valid, scriptable, and follows these rules:
				- Use 'version', 'domain', 'workflow' as top-level keys.
				- Each workflow step must include:
					- 'id': unique step identifier
					- 'action': action name
					- 'description': action short description
					- 'inputs: parameters required for that action
					- optional 'outputs' and 'depends_on'
				- Ensure references use '$step.output' format.
				4. Output ONLY a YAML pseudo-code block, no explanations.

				If needed, add parameters or intermediate steps to make the workflow more precise.
			`;
			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [
					{ role: 'system', content: metaPrompt },
					{ role: 'user', content: prompt + yamlScript },
				],
			};

			const response = await this.callAPI('chat/completions', request);
			const content = response.choices[0].message?.content || '';
			const yaml = this.parseYamlFromCodeBlockRegex(content);
			console.log(yaml);
			return yaml;
		} catch (error) {
			console.log(error);
			return '';
		}
	}
}

const openRouterService = new OpenRouterService();
export default openRouterService;
