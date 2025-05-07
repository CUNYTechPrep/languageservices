export class LLMError extends Error {
	code: string;
	constructor(code:string, message:string){
		super(message);
		this.code = code;
	}
}

const LLM_ERRORS_SUGGESTIONS: Record<string, string> = {
  400: "The request is malformed. Ensure that all required parameters are provided and valid. If using a prompt template, double-check placeholders and formatting.",
  401: "Authentication failed. Check if your OAuth session is still active or if your API key is correct and enabled.",
  402: "You’ve run out of credits. Top up your account or obtain a valid API key with sufficient quota.",
  403: "Your input was flagged during moderation. Review the content being sent and ensure it adheres to model guidelines.",
  408: "The request took too long to process. Consider simplifying the input or trying again later.",
  429: "You are sending requests too quickly. Reduce request frequency or implement exponential backoff retries.",
  502: "The model server failed to respond properly. Try switching to a different model or retrying after a short delay.",
  503: "No available model provider meets the request’s routing requirements. Consider changing the model or relaxing constraints like region or moderation requirements.",
}

export function handleLLMError(error: LLMError): string {
	const suggestion = LLM_ERRORS_SUGGESTIONS[error.code] || "Please check the server logs for more details.";
	return `Suggestion: ${suggestion}`;
}

