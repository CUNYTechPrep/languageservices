import { LLMError, getErrorMessage, isNetworkError } from '../errorHandler';
import { logErrorToFile, logResponseToFile } from '../logger';

export interface OpenRouterRequest {
	model: string;
	messages: {
		role: 'user' | 'system' | 'assistant';
		content: string;
	}[];
	models?: string[];
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	stop?: string | string[];
}

export interface OpenRouterResponse {
	id?: string;
	model?: string;
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
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

export class OpenRouterClient {
	private apiKey: string;
	private apiUrl: string;

	constructor() {
		this.apiKey = process.env.OPENROUTER_KEY || '';
		this.apiUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1';

		if (!this.apiKey) {
			throw new Error(
				'OpenRouter API key is not configured. Please set OPENROUTER_KEY environment variable.'
			);
		}
	}

	/**
	 * Call the OpenRouter API with proper error handling and logging
	 */
	async callAPI(endpoint: string, request: OpenRouterRequest): Promise<OpenRouterResponse> {
		const promptText = this.extractPromptFromRequest(request);

		try {
			const response = await fetch(`${this.apiUrl}/${endpoint}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(request),
			});

			const statusCode = response.status;

			if (!response.ok) {
				let errorData: { error: { message: string; code: string } };
				try {
					errorData = (await response.json()) as {
						error: { message: string; code: string };
					};
				} catch {
					// If JSON parsing fails, create a generic error
					throw new LLMError(
						String(statusCode),
						`HTTP ${statusCode}: ${response.statusText}`,
						statusCode
					);
				}

				const llmError = new LLMError(
					errorData.error.code || String(statusCode),
					errorData.error.message || response.statusText,
					statusCode
				);

				// Log the error
				logErrorToFile(promptText, {
					model: request.model,
					message: llmError.message,
					code: llmError.code,
					statusCode: statusCode,
				});

				throw llmError;
			}

			const data = (await response.json()) as OpenRouterResponse;

			// Check for embedded error in choices
			if (data.choices?.[0]?.error) {
				const err = data.choices[0].error;
				const llmError = new LLMError(err.code, err.message);

				logErrorToFile(promptText, {
					model: request.model,
					message: err.message,
					code: err.code,
				});

				throw llmError;
			}

			// Log successful response
			logResponseToFile(promptText, {
				model: data.model || request.model,
				choices: data.choices,
				usage: data.usage,
			});

			return data;
		} catch (error) {
			// If it's already an LLMError, re-throw it
			if (error instanceof LLMError) {
				throw error;
			}

			// Handle network errors
			if (isNetworkError(error)) {
				const networkError = new LLMError(
					'NETWORK_ERROR',
					'Network error: Unable to reach OpenRouter API. Please check your internet connection.',
					0,
					error
				);

				logErrorToFile(promptText, {
					model: request.model,
					message: networkError.message,
					code: 'NETWORK_ERROR',
				});

				throw networkError;
			}

			// Handle unexpected errors
			const message = getErrorMessage(error);
			const unexpectedError = new LLMError(
				'UNEXPECTED_ERROR',
				`Unexpected error: ${message}`,
				0,
				error
			);

			logErrorToFile(promptText, {
				model: request.model,
				message: unexpectedError.message,
				code: 'UNEXPECTED_ERROR',
			});

			throw unexpectedError;
		}
	}

	/**
	 * Extract a representative prompt text for logging
	 */
	private extractPromptFromRequest(request: OpenRouterRequest): string {
		const userMessages = request.messages.filter(m => m.role === 'user');
		if (userMessages.length === 0) {
			return '[No user messages]';
		}

		// Return the first user message, truncated if necessary
		const firstUserMessage = userMessages[0].content;
		const maxLength = 500;

		if (firstUserMessage.length <= maxLength) {
			return firstUserMessage;
		}

		return firstUserMessage.substring(0, maxLength) + '... [truncated]';
	}
}

const openRouterClient = new OpenRouterClient();
export default openRouterClient;
