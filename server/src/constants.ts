/**
 * Configuration constants for the language server
 */

/**
 * Retry and rate limiting configuration
 */
export const RETRY_CONFIG = {
	/** Maximum number of retry attempts for failed requests */
	MAX_RETRIES: 3,
	/** Base delay in milliseconds for exponential backoff */
	BASE_DELAY_MS: 1000,
	/** Delay between workflow steps to avoid rate limiting */
	STEP_DELAY_MS: 2000,
} as const;

/**
 * LLM model configuration
 */
export const MODEL_CONFIG = {
	/** Primary model for YAML execution (mock mode) */
	YAML_EXECUTOR_PRIMARY: 'deepseek/deepseek-chat-v3-0324:free',
	/** Fallback models for YAML execution (mock mode) */
	YAML_EXECUTOR_FALLBACKS: ['shisa-ai/shisa-v2-llama3.3-70b:free', 'qwen/qwen3-32b:free'],

	/** Primary model for YAML workflow step execution */
	WORKFLOW_STEP_PRIMARY: 'deepseek/deepseek-chat-v3.1:free',
	/** Fallback models for workflow step execution */
	WORKFLOW_STEP_FALLBACKS: ['qwen/qwen3-coder:free', 'deepseek/deepseek-r1-0528-qwen3-8b:free'],

	/** Primary model for YAML script generation and refinement */
	YAML_BUILDER_PRIMARY: 'deepseek/deepseek-chat-v3.1:free',
	/** Fallback models for YAML script generation and refinement */
	YAML_BUILDER_FALLBACKS: ['qwen/qwen3-coder:free', 'deepseek/deepseek-r1-0528-qwen3-8b:free'],
} as const;

/**
 * JSON indentation for pretty-printing
 */
export const JSON_INDENT = 2;

/**
 * Logging configuration
 */
export const LOGGING_CONFIG = {
	/** Maximum number of log entries to keep in circular buffer */
	MAX_LOGS: 50,
	/** Maximum characters to display for debug output */
	MAX_DEBUG_CHARS: 500,
} as const;

/**
 * Error handling configuration
 */
export const ERROR_CONFIG = {
	/** HTTP status codes that are retryable */
	RETRYABLE_STATUS_CODES: ['408', '429', '502', '503', '504'],
	/** Minimum status code for server errors */
	SERVER_ERROR_MIN_CODE: 500,
} as const;
