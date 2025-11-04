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

			User's prompt:
			${userPrompt}
		`;

		const request: OpenRouterRequest = {
			model: 'deepseek/deepseek-chat-v3-0324:free',
			models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
			messages: [{ role: 'user', content: metaPrompt }],
		};

		const response = await openRouterClient.callAPI('chat/completions', request);
		return response.choices[0].message?.content || '';
	}

	async createYamlScript(prompt: string): Promise<string> {
		try {
			const metaPrompt = `
				You are an AI system that converts natural-language prompts into executable pseudo-code written in **YAML**.  
				This YAML represents a human-friendly scripting language that can orchestrate AI coding assistants.

				Follow a three-phase reasoning process internally:

				### Phase 1 — Convert
				Convert the user's natural-language goal into a YAML script written in pseudo-code style.  
				The YAML should clearly express:
					- The domain or context (e.g., web, mobile, data, design)
					- The high-level objective
					- Sequential or parallel actions using natural verbs (e.g., "Design", "Build", "Generate", "Analyze")
					- Structured parameters for each action
					- Optional modifiers like "After", "If fails", or "Produce"
				Keep it readable and human-friendly — closer to English than JSON.

				### Phase 2 — Evaluate
				Analyze the YAML you created. Identify:
					- Missing details or ambiguous instructions
					- Possible enhancements or extra steps that would make it more useful or complete
					- Opportunities to make the pseudo-code more expressive or precise

				### Phase 3 — Revise
				Integrate all improvements and extensions into the final YAML script.
				Make sure the result:
					- Remains valid YAML
					- Feels natural and domain-appropriate
					- Captures all relevant context from the original prompt
					- Is ready for downstream AI execution

				Return ONLY the **final, revised YAML code block**, with no explanations, analysis, or commentary.

				User's prompt:
				${prompt}
			`;

			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3.1:free',
				models: ['qwen/qwen3-coder:free', 'deepseek/deepseek-r1-0528-qwen3-8b:free'],
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
				You are an expert YAML workflow engineer and meta-prompting specialist.  
				You refine and evolve **pseudo-code YAML scripts** that describe AI-driven workflows or code-generation plans.

				The input YAML uses a flexible, human-friendly syntax — 
				it may mix English-like descriptions with structured steps or parameters.

				Your goal is to iteratively **evaluate and enhance** this YAML in response to the user's refinement instruction.

				Follow a structured reasoning process internally:

				### Phase 1 — Understand
				Read the current YAML and the user's refinement request.  
				Grasp the intent, domain, and purpose of the workflow.

				### Phase 2 — Evaluate
				Analyze the YAML for:
					- Missing or underdefined parts
					- Opportunities to make the pseudo-code clearer, more complete, or more expressive
					- Consistency and flow between steps
					- Domain-specific vocabulary improvements
					- Structural or logical improvements based on the user's feedback

				### Phase 3 — Extend and Revise
				Apply all improvements, extensions, and refinements directly to the YAML script.  
				You may:
					- Add new steps or parameters
					- Reword vague actions into precise ones
					- Introduce new domain keywords naturally
					- Clarify dependencies or outputs
				Keep the style readable, natural, and semantically rich.

				Return ONLY the **final revised YAML code block**, with no commentary or explanations.

				Current YAML Script:
				<<<${yamlScript}>>>

				User's refinement instruction:
				${userPrompt}
			`;
			const request: OpenRouterRequest = {
				model: 'deepseek/deepseek-chat-v3-0324:free',
				models: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],
				messages: [{ role: 'user', content: metaPrompt }],
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
