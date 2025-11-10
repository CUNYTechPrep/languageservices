/**
 * Custom error class for LLM-related errors
 */
export class LLMError extends Error {
	code: string;
	statusCode?: number;
	details?: unknown;

	constructor(code: string, message: string, statusCode?: number, details?: unknown) {
		super(message);
		this.name = 'LLMError';
		this.code = code;
		this.statusCode = statusCode;
		this.details = details;
		Error.captureStackTrace(this, this.constructor);
	}

	/**
	 * Check if this is a rate limit error
	 */
	isRateLimitError(): boolean {
		return (
			this.statusCode === 429 ||
			this.code === '429' ||
			this.message.toLowerCase().includes('rate limit') ||
			this.message.toLowerCase().includes('too quickly')
		);
	}

	/**
	 * Check if this error is retryable
	 */
	isRetryable(): boolean {
		const retryableCodes = ['408', '429', '502', '503', '504'];
		return (
			retryableCodes.includes(this.code) || (this.statusCode ? this.statusCode >= 500 : false)
		);
	}

	/**
	 * Get user-friendly error message
	 */
	getUserMessage(): string {
		return handleLLMError(this);
	}
}

/**
 * Error class for YAML processing errors
 */
export class YAMLProcessingError extends Error {
	originalError?: Error;
	filePath?: string;

	constructor(message: string, originalError?: Error, filePath?: string) {
		super(message);
		this.name = 'YAMLProcessingError';
		this.originalError = originalError;
		this.filePath = filePath;
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Error class for validation errors
 */
export class ValidationError extends Error {
	field?: string;

	constructor(message: string, field?: string) {
		super(message);
		this.name = 'ValidationError';
		this.field = field;
		Error.captureStackTrace(this, this.constructor);
	}
}

const LLM_ERRORS_SUGGESTIONS: Record<string, string> = {
	'400': 'The request is malformed. Ensure that all required parameters are provided and valid. If using a prompt template, double-check placeholders and formatting.',
	'401': 'Authentication failed. Check if your OAuth session is still active or if your API key is correct and enabled.',
	'402': "You've run out of credits. Top up your account or obtain a valid API key with sufficient quota.",
	'403': 'Your input was flagged during moderation. Review the content being sent and ensure it adheres to model guidelines.',
	'408': 'The request took too long to process. Consider simplifying the input or trying again later.',
	'429': 'You are sending requests too quickly. Reduce request frequency or implement exponential backoff retries.',
	'502': 'The model server failed to respond properly. Try switching to a different model or retrying after a short delay.',
	'503': "No available model provider meets the request's routing requirements. Consider changing the model or relaxing constraints like region or moderation requirements.",
	'504': 'Gateway timeout. The request took too long. Try simplifying the input or retry later.',
};

/**
 * Get user-friendly error message for LLM errors
 */
export function handleLLMError(error: LLMError): string {
	const suggestion =
		LLM_ERRORS_SUGGESTIONS[error.code] ||
		'An unexpected error occurred. Please check the server logs for more details.';
	return `${error.message}. ${suggestion}`;
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	if (error && typeof error === 'object' && 'message' in error) {
		return String(error.message);
	}
	return 'An unknown error occurred';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const message = error.message.toLowerCase();
	return (
		message.includes('network') ||
		message.includes('econnrefused') ||
		message.includes('enotfound') ||
		message.includes('timeout') ||
		message.includes('fetch failed')
	);
}
