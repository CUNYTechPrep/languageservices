/**
 * TypeScript type definitions for YAML workflow documents
 */

/**
 * Represents a single step in a workflow
 */
export interface WorkflowStep {
	/** Step identifier (can be 'Step' or 'name') */
	Step?: string;
	name?: string;
	/** Step description or other domain-specific properties */
	[key: string]: string | number | boolean | object | null | undefined;
}

/**
 * Represents a complete YAML workflow document
 */
export interface YamlWorkflowDocument {
	/** Array of workflow steps */
	steps?: WorkflowStep[];
	/** Variables used in the workflow */
	variables?: Record<string, unknown>;
	/** Other top-level properties */
	[key: string]:
		| string
		| number
		| boolean
		| object
		| null
		| undefined
		| WorkflowStep[]
		| Record<string, unknown>;
}

/**
 * Represents the output from executing a workflow
 * Map of step names to their output content
 */
export type WorkflowExecutionResult = Record<string, string>;

/**
 * Type guard to check if an object is a valid WorkflowStep
 */
export function isWorkflowStep(obj: unknown): obj is WorkflowStep {
	return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/**
 * Type guard to check if an object is a valid YamlWorkflowDocument
 */
export function isYamlWorkflowDocument(obj: unknown): obj is YamlWorkflowDocument {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}

	const doc = obj as YamlWorkflowDocument;

	// If steps is present, it must be an array
	if (doc.steps !== undefined && !Array.isArray(doc.steps)) {
		return false;
	}

	// If variables is present, it must be an object
	if (
		doc.variables !== undefined &&
		(typeof doc.variables !== 'object' ||
			doc.variables === null ||
			Array.isArray(doc.variables))
	) {
		return false;
	}

	return true;
}

/**
 * Structured result type for YAML parsing
 */
export type ParseResult =
	| {
			success: true;
			data: YamlWorkflowDocument;
	  }
	| {
			success: false;
			error: string;
			phase: 'parsing' | 'variable-replacement' | 'include-processing' | 'validation';
	  };
