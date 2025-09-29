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

			Return **ONLY THE IMPROVED PROMPT** in the same format as the user's input. 
			DO NOT RETURN **Explanations or meta-commentary**.
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
				You are an AI assistant that designs **domain-specific workflow languages (DSLs) in YAML form**.
				The user will provide:
				- A short description of their goal (plain text).
				- The target domain (e.g., fitness, marketing, research).

				Your task:
				1. Interpret the description and generate a **DSL-style YAML script** for that domain.
				2. The script must not look like a rigid config file — it should feel like a **mini-language**.
				3. Conventions:
				- Output ONLY a YAML code block.
				- Use a **title at the top** (e.g., "Fitness Plan", "Research Workflow").
				- Each step begins with '- Step: <name>'.
				- For the body of each step:
					- Prefer **domain-specific keywords** instead of generic ones.
					*Examples:*
						- Research domain may use: 'Search', 'Summarize', 'Themes', 'Report'.
						- Fitness domain may use: 'Exercise', 'Routine', 'Stretch', 'Nutrition'.
						- Marketing domain may use: 'Audience', 'Campaign', 'Message', 'Channel'.
					- Keep parameters structured as key-value pairs under those keywords.
				- Use 'Produce' to declare outputs.
				- Use 'After' for dependencies.
				- Use 'If fails' for error handling.
				4. Keywords should vary by domain — **do not always use the same schema**.
				5. The result should be both **machine-readable** and **human-friendly**, 
				like GitHub Actions or IBM's Prompt Declaration Language.

				Return only a YAML pseudo-code block.
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
				These scripts are **domain-specific DSLs** that orchestrate AI-driven workflows.  
				The DSL uses **human-friendly, domain-specific keywords** (e.g., 'Search', 'Summarize', 'Exercise', 'Campaign') instead of rigid config fields.

				You will be given:
				- The current YAML script.
				- A refinement instruction (what to improve).

				Your tasks:
				1. Analyze the YAML for vague, missing, or inconsistent elements.  
				2. Apply the user's refinement instruction while preserving the DSL style.  
				3. Ensure the YAML is valid, scriptable, and follows these rules:
				- Top-level: '<Domain> Workflow' or '<Domain> Plan'.  
				- Each workflow step must include:
					- 'Step': human-friendly step name.
					- One or more **domain-specific keywords** (e.g., 'Search', 'Routine', 'Report') with their parameters.  
					- 'Produce': outputs of the step (if any).  
					- Optional modifiers:  
					- 'After' → defines dependencies.  
					- 'If fails' → error handling.  
				4. If needed, add parameters or intermediate steps to make the workflow precise and executable.  
				5. Output ONLY a YAML pseudo-code block, no explanations.

				Current YAML Script:
				${yamlScript}
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
			console.log(content);
			const yaml = this.parseYamlFromCodeBlockRegex(content);
			console.log(yaml);
			return yaml;
		} catch (error) {
			console.log(error);
			return '';
		}
	}

	async mockTestYamlScript(yamlScript: string): Promise<string> {
		try {
			const metaPrompt = `
				You are a YAML DSL interpreter that executes YAML scripts to generate actual code. 
				Your task is to read the YAML script and produce the requested deliverables.
				Execute each workflow step in order, generating code/files as specified:
				For each step in workflow:
				1. Read step.action and step.description
				2. Use step.inputs to understand what data/context you have
				3. Generate the code/content described in step.outputs
				4. Handle any error conditions per step.error_handling
				5. Move to next step only after current step validation passes
			`;
			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [
					{ role: 'system', content: metaPrompt },
					{ role: 'user', content: yamlScript },
				],
			};

			const response = await this.callAPI('chat/completions', request);
			const content = response.choices[0].message?.content || '';
			console.log(content);
			return content;
		} catch (error) {
			console.log(error);
			return '';
		}
	}
}

const openRouterService = new OpenRouterService();
export default openRouterService;
