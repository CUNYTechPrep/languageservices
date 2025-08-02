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

	async refinePrompt(prompt: string): Promise<string> {
		const metaPrompt = `
			You are a prompt engineering specialist focused on iteratively improving raw prompts.
			Your task is to refine and enhance the user's prompt while keeping it in natural, 
			unstructured format to preserve creative flow and allow for easy iteration.
			Your role during iterations:

			- Clarify and expand on the core objective
			- Fill in missing details or considerations
			- Improve clarity and specificity
			- Suggest enhancements the user might have overlooked
			- Remove ambiguity and vague language
			- Maintain the natural, conversational flow

			Focus on improving:

			- Clarity: Make intentions and requirements crystal clear
			- Completeness: Identify and fill gaps in the original request
			- Specificity: Replace vague terms with concrete details
			- Feasibility: Ensure the request is actionable and realistic
			- Context: Add relevant domain knowledge or constraints

			Keep the output unstructured - write in natural language that flows well and captures all nuances. Do not impose rigid categories or formal structure yet.
			Return **ONLY** the improved prompt in natural, unstructured format. DO NOT RETURN **Explanations or meta-commentary**.
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
}

const openRouterService = new OpenRouterService();
export default openRouterService;
