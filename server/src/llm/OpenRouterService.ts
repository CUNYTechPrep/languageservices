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
			return input.trim();
		}

		const yamlContent = yamlMatch[1].trim();

		return yamlContent;
	}

	async refinePrompt(userPrompt: string): Promise<string> {
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
				{ role: 'user', content: userPrompt },
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
				- A short description of their goal (plain text) with the target domain.

				Your task:
				1. Interpret the description and generate a **DSL-style YAML script** for that domain.
				2. The script must not look like a rigid config file — it should feel like a **mini-language**.
				3. Conventions:
				- Output ONLY a YAML code block.
				- Top-level: 'version', 'domain', 'workflow' and 'title' with '<Domain> Workflow' or '<Domain> Plan' values.
				- Each step begins with '- Step: <name>'. <name> should be action words (e.g. 'Search', 'Summarize')
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

				User's description:
				${prompt}
			`;

			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [{ role: 'user', content: metaPrompt }],
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

	async refineYamlScript(yamlScript: string, userPrompt: string): Promise<string> {
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
				- Top-level: 'version', 'domain', 'workflow' and 'title' with '<Domain> Workflow' or '<Domain> Plan' values.  
				- Each workflow step inside 'workflow' must include:
					- 'Step': human-friendly step name.
					- One or more **domain-specific keywords** (e.g., 'Search', 'Routine', 'Report') with their parameters.  
					- 'Produce': outputs of the step (if any).  
					- Optional modifiers:  
					- 'After' → defines dependencies.  
					- 'If fails' → error handling.  
				4. If needed, add parameters or intermediate steps to make the workflow precise and executable.  
				5. Output ONLY a YAML pseudo-code block, no explanations.

				Current YAML Script (between <<< >>>):
				<<<${yamlScript}>>>
			`;
			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [
					{ role: 'system', content: metaPrompt },
					{ role: 'user', content: userPrompt },
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
