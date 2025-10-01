import openRouterClient, { OpenRouterRequest } from './llm/OpenRouterClient';

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

			const response = await openRouterClient.callAPI('chat/completions', request);
			const content = response.choices[0].message?.content || '';
			console.log(content);
			return content;
		} catch (error) {
			console.log(error);
			return '';
		}
	}
}

const yamlExecutor = new YamlExecutor();
export default yamlExecutor;
