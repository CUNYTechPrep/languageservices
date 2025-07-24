# YAML LSP for Domain-Specific Language (VS Code LSP)

A modern, extensible Language Server Protocol (LSP) implementation for VS Code, supporting YAML,
variable interpolation, file/module includes, and LLM-powered features.

## Features

- **YAML & Plain Text Support**: Language features for YAML and plaintext files.
- **Completions**: Context-aware code completion for YAML keywords and custom schema.
- **Diagnostics**: Real-time diagnostics for uppercase words, undefined variables, and more.
- **Variable Interpolation**: Jinja2-style `${var}` variable replacement using `.vars.yaml` files.
- **File Includes**: Import YAML files as modules using `include` directives.
- **LLM Integration**: Send prompts and data to LLMs (OpenRouter, DeepSeek, etc.) for code analysis,
  correction, and feedback.
- **Schema Keyword Extraction**: Extract and compare YAML schema keywords with your document.
- **End-to-End Tests**: Automated tests for both client and server.

## Project Structure

```
.
├── client/                  # VS Code Language Client
│   ├── src/
│   │   ├── extension.ts     # Client entry point
│   │   └── test/            # End-to-end tests
│   └── ...
├── server/                  # Language Server
│   ├── src/
│   │   ├── server.ts        # Main LSP server
│   │   ├── include.ts       # Include/module logic for YAML
│   │   ├── logger.ts        # Logging utilities
│   │   ├── errorHandler.ts  # LLM and server error handling
│   │   └── expressions/     # Variable resolution and interpolation
│   └── ...
├── package.json             # Monorepo manifest
├── README.md                # This file
└── ...
```

## Getting Started

1. **Install dependencies**
   ```sh
   npm install
   ```
2. **Build the project**
   ```sh
   npm run compile
   ```
   Or start in watch mode:
   ```sh
   npm run watch
   ```
3. **Open in VS Code**
   - Open this folder in VS Code.
   - Press `F5` to launch the Extension Development Host.

## Usage

- Open a YAML or plaintext file.
- Use completions for keywords like `prompt`, `data`, `include`, etc.
- Add variables in a `.vars.yaml` file at the workspace root. Use `${var}` in your YAML to reference
  them.
- Use `include: somefile.yaml` to import YAML modules.
- Use the extension's commands or UI to send prompts/data to the LLM for feedback or correction.

## Advanced

- **Schema Keyword Extraction**: Use the `llm-schema.extractKeywords` request to compare your YAML
  with a schema.
- **LLM Feedback**: Use the `llm-feedback.insertComment` request to get LLM-powered comments or
  corrections.
- **Custom Includes**: Extend `server/src/include.ts` to support new file types or module behaviors.

## Testing

- Run all tests:
  ```sh
  cd client && npm test
  cd ../server && npm test
  ```

## Contributing

Contributions are welcome! Please open issues or pull requests for improvements, bug fixes, or new
features.
