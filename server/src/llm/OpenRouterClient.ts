import { LLMError, handleLLMError } from '../errorHandler';

export interface OpenRouterRequest {
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

export interface OpenRouterResponse {
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

export class OpenRouterClient {
	private apiKey: string;
	private apiUrl: string;

	constructor() {
		this.apiKey = process.env.OPENROUTER_KEY || '';
		this.apiUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1';

		if (!this.apiKey) {
			console.warn('OpenRouter API key is not configured');
		}
	}

	async callAPI(endpoint: string, request: OpenRouterRequest): Promise<OpenRouterResponse> {
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
				throw new LLMError(error.error.code, error.error.message);
			}

			const data = (await response.json()) as OpenRouterResponse;

			// In case OpenRouter returns embedded error in choices
			if (data.choices?.[0]?.error) {
				const err = data.choices[0].error;
				throw new LLMError(err.code, err.message);
			}

			return data;
		} catch (error) {
			if (error instanceof LLMError) {
				// Normalize error using LLM handler
				const parsedError = handleLLMError(error);
				console.error('OpenRouter API Error:', parsedError);
				throw new Error(parsedError);
			}
			console.error('Error calling OpenRouter API:', error);
			throw new Error('Unknown error occurred while calling OpenRouter API');
		}
	}
}

const openRouterClient = new OpenRouterClient();
export default openRouterClient;
