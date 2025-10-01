import openRouterClient, { OpenRouterRequest } from './OpenRouterClient';
import { parseYamlFromCodeBlockRegex } from './utils';

export class YamlWorkflowBuilder {
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

		const response = await openRouterClient.callAPI('chat/completions', request);
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

			const response = await openRouterClient.callAPI('chat/completions', request);
			const content = response.choices[0].message?.content || '';
			const yaml = parseYamlFromCodeBlockRegex(content);
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

			const response = await openRouterClient.callAPI('chat/completions', request);
			const content = response.choices[0].message?.content || '';
			console.log(content);
			const yaml = parseYamlFromCodeBlockRegex(content);
			console.log(yaml);
			return yaml;
		} catch (error) {
			console.log(error);
			return '';
		}
	}
}

const yamlWorkflowBuilder = new YamlWorkflowBuilder();
export default yamlWorkflowBuilder;
