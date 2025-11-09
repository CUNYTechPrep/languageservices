import openRouterClient, { OpenRouterRequest } from './OpenRouterClient';
import { parseYamlFromCodeBlockRegex, parseJsonFromCodeBlockRegex } from './utils';

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
			model: 'deepseek/deepseek-chat-v3.1:free',
			models: ['qwen/qwen3-coder:free', 'deepseek/deepseek-r1-0528-qwen3-8b:free'],
			messages: [{ role: 'user', content: metaPrompt }],
		};

		const response = await openRouterClient.callAPI('chat/completions', request);
		return response.choices[0].message?.content || '';
	}

	async createYamlScript(prompt: string): Promise<{ yaml: string; schema: any }> {
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
				
				### Phase 4 - Generate Schema
				Design a comprehensive JSON Schema (using JSON Schema draft 2020-12) that fully describes the structure 
				and content of the YAML document you created.
				Follow these instructions for the schema:
				- Include top-level properties, the steps array, and any domain-specific keywords used.
				- For each property, including nested objects and array item objects (e.g., each \`step\`), include:
				  - \`type\`
				  - \`description\` explaining the purpose and expected values
				  - \`examples\` when appropriate
				  - \`required\` where applicable
				  - \`properties\` for nested objects (recursively described)
				  - any \`enum\` or \`format\` constraints where relevant

				Return ONLY a single JSON object with the shape { "yaml": "...", "schema": { ... } } inside a \`\`\`json\`\`\` code block.
				- The \`yaml\` field must contain the final revised YAML script as a string (no surrounding code fences).
				- The \`schema\` field must be a valid JSON Schema object that fully describes the YAML document (top-level properties, steps array, and any domain keywords).
				Do NOT return any additional commentary or text.

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

			// Extract the JSON object from the response
			const jsonText = parseJsonFromCodeBlockRegex(content);
			let parsed: any = {};
			try {
				parsed = JSON.parse(jsonText);
			} catch (err) {
				console.log('Failed to parse JSON from model response:', err);
				// Fallback: attempt to extract YAML only
				const yamlOnly = parseYamlFromCodeBlockRegex(content);
				return { yaml: yamlOnly, schema: {} };
			}

			const yaml = typeof parsed.yaml === 'string' ? parsed.yaml : '';
			const schema = parsed.schema || {};

			console.log('Created YAML:', yaml);
			console.log('Created Schema:', schema);

			return { yaml, schema };
		} catch (error) {
			console.log(error);
			return { yaml: '', schema: {} };
		}
	}

	async refineYamlScript(
		yamlScript: string,
		userPrompt: string
	): Promise<{ yaml: string; schema: any }> {
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

				### Phase 4 - Generate Schema
				Design a comprehensive JSON Schema (using JSON Schema draft 2020-12) that fully describes the structure 
				and content of the YAML document you created.
				Follow these instructions for the schema:
				- Include top-level properties, the steps array, and any domain-specific keywords used.
				- For each property, including nested objects and array item objects (e.g., each \`step\`), include:
				  - \`type\`
				  - \`description\` explaining the purpose and expected values
				  - \`examples\` when appropriate
				  - \`required\` where applicable
				  - \`properties\` for nested objects (recursively described)
				  - any \`enum\` or \`format\` constraints where relevant

				Return ONLY a single JSON object with the shape { "yaml": "...", "schema": { ... } } inside a \`\`\`json\`\`\` code block.
				- The \`yaml\` field must contain the final revised YAML script as a string (no surrounding code fences).
				- The \`schema\` field must be a valid JSON Schema object that fully describes the YAML document (top-level properties, steps array, and any domain keywords).
				Do NOT return any additional commentary or text.

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
			console.log('Raw refine response:', content);

			const jsonText = parseJsonFromCodeBlockRegex(content);
			let parsed: any = {};
			try {
				parsed = JSON.parse(jsonText);
			} catch (err) {
				console.log('Failed to parse JSON from refine response:', err);
				const yamlOnly = parseYamlFromCodeBlockRegex(content);
				return { yaml: yamlOnly, schema: {} };
			}

			const yaml = typeof parsed.yaml === 'string' ? parsed.yaml : '';
			const schema = parsed.schema || {};

			console.log('Refined YAML:', yaml);
			console.log('Refined Schema:', schema);

			return { yaml, schema };
		} catch (error) {
			console.log(error);
			return { yaml: '', schema: {} };
		}
	}
}

const yamlWorkflowBuilder = new YamlWorkflowBuilder();
export default yamlWorkflowBuilder;
