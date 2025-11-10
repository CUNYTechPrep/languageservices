import * as fs from 'fs';
import * as path from 'path';
import { LOGGING_CONFIG } from './constants';

// Define the directory and file path for logs
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_PATH = path.join(LOG_DIR, 'llm_logs.jsonl');

// Maximum number of logs to keep in the file
const MAX_LOGS = LOGGING_CONFIG.MAX_LOGS;

// Define the structure of the log entry
interface LLMLog {
	status: 'success' | 'error';
	timestamp: string;
	model: string;
	prompt: string;
	error?: string;
	response?: string;
	tokenUsage?: number;
}

// Define the structure for error JSON passed to logErrorToFile
interface ErrorLogData {
	model?: string;
	message?: string;
	code?: string;
	statusCode?: number;
}

// Define the structure for response JSON passed to logResponseToFile
interface ResponseLogData {
	model?: string;
	usage?: {
		total_tokens?: number;
		prompt_tokens?: number;
		completion_tokens?: number;
	};
	choices?: {
		message?: {
			content?: string;
		};
	}[];
}

// CircularLogger class to manage log entries
class CircularLogger {
	private logs: LLMLog[] = [];
	private writeCount = 0; // Counter to track the number of writes

	constructor() {
		// Ensure the log directory exists
		fs.mkdirSync(LOG_DIR, { recursive: true });

		// Initialize from existing file if exists
		if (fs.existsSync(LOG_PATH)) {
			const fileContent = fs
				.readFileSync(LOG_PATH, 'utf-8')
				.split('\n')
				.filter(Boolean)
				.map(line => {
					try {
						return JSON.parse(line) as LLMLog;
					} catch {
						return null;
					}
				})
				.filter((log): log is LLMLog => log !== null);
			//Keep only the last MAX_LOGS entries
			this.logs = fileContent.slice(-MAX_LOGS);
			//Rewrite the log file with the cleaned logs
			// this.flushAll();
		}
	}

	//Add a new log entry
	log(entry: LLMLog) {
		// Add the new log entry to the logs array
		this.logs.push(entry);
		// Write the new log entry to the file
		try {
			fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
			this.writeCount++;
		} catch (err) {
			console.error('Error writing to log file:', err);
		}
		if (this.logs.length >= MAX_LOGS * 2) {
			for (let i = 0; i < MAX_LOGS; i++) {
				this.logs.shift();
			}
			this.flushAll(); // Flush every 2*MAX_LOGS writes
		}
	}

	//Flush all logs to the file
	private flushAll() {
		try {
			//Convert all logs to JSON strings, separated by newlines
			let content = this.logs.map(log => JSON.stringify(log)).join('\n');
			content += '\n'; // Add a newline at the end for proper formatting
			//Overwrite the log file with the new content
			fs.writeFileSync(LOG_PATH, content, 'utf-8');
		} catch (err) {
			console.error('Error writing to log file:', err);
		}
	}
}

export const logger = new CircularLogger();

export function logErrorToFile(prompt: string, errorJson: ErrorLogData): void {
	// Create a log entry
	const logEntry: LLMLog = {
		status: 'error',
		timestamp: new Date().toUTCString(),
		model: errorJson.model || 'unknown model',
		prompt,
		error: errorJson.message || 'unknown error',
		tokenUsage: 0,
	};

	logger.log(logEntry);
}
export function logResponseToFile(prompt: string, responseJson: ResponseLogData): void {
	// Convert error and response to JSON strings
	const tokenUsage = parseInt(String(responseJson.usage?.total_tokens || '0'));
	// Create a log entry
	const logEntry: LLMLog = {
		status: 'success',
		timestamp: new Date().toUTCString(),
		model: responseJson.model || 'unknown model',
		prompt,
		response: responseJson?.choices?.[0]?.message?.content || 'unknown response',
		tokenUsage: tokenUsage,
	};
	logger.log(logEntry);
}
