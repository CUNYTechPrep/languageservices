import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.resolve(process.cwd(),'logs')
const LOG_PATH = path.join(LOG_DIR, 'llm_logs.json');


const MAX_LOGS = 100	;

interface LLMLog{
	status:'success' | 'error';
	timestamp:string;
	model:string;
	prompt:string;
	error?:string;
	response?:string;
	tokenUsage?:number;
}

class CircularLogger {
	private logs: LLMLog[] = [];

	constructor() {
		fs.mkdirSync(LOG_DIR, { recursive: true });

		// Initialize from existing file if exists
		if (fs.existsSync(LOG_PATH)) {
			const fileContent = fs.readFileSync(LOG_PATH, 'utf-8')
				.split('\n')
				.filter(Boolean)
				.map(line => JSON.parse(line) as LLMLog);

			this.logs = fileContent.slice(-MAX_LOGS); // Only keep latest logs
			this.flushAll(); // Rewrite file to clean up
		}
	}

	log(entry: LLMLog) {
		if (this.logs.length >= MAX_LOGS) {
			this.logs.shift();
		}
		this.logs.push(entry);
		this.flushAll();
	}

	private flushAll() {
		try {
			const content = this.logs.map(log => JSON.stringify(log)).join('\n');
			fs.writeFileSync(LOG_PATH, content, 'utf-8');
		} catch (err) {
			console.error('Error writing to log file:', err);
		}
	}
}

export const logger = new CircularLogger();

export function logErrorToFile(model:string, prompt:string, errorJson: any){
		// Create a log entry
	const logEntry: LLMLog = {
		status: 'error',
		timestamp: new Date().toUTCString(),
		model,
		prompt,
		error: errorJson.message || 'unknown error',
		tokenUsage: 0,
	};

	logger.log(logEntry);
}
export function logResponseToFile(model:string, prompt:string, responseJson: any){
	// Convert error and response to JSON strings
	const tokenUsage = parseInt(responseJson.usage.total_tokens || '0');
	// Create a log entry
	const logEntry: LLMLog = {
		status: 'success',
		timestamp: new Date().toUTCString(),
		model,
		prompt,
		response: responseJson?.choices[0]?.message?.content || 'unknown response',
		tokenUsage: tokenUsage,
	};
	console.log('logEntry', logEntry);
	console.log('logging to file', LOG_PATH);

	logger.log(logEntry);
}