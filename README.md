# AI-Powered YAML Workflow Language Server

A sophisticated Language Server Protocol (LSP) implementation that transforms natural language into
executable YAML workflows using Large Language Models (LLMs). This VS Code extension enables
intelligent YAML authoring, validation, and execution with LLM-powered assistance.

## 🚀 Key Features

### LLM-Powered Workflow Generation

- **Natural Language to YAML**: Convert plain English descriptions into structured YAML workflows
- **Intelligent Script Refinement**: Iteratively improve YAML scripts based on user feedback
- **Multi-Step Execution**: Execute workflows with context-aware step chaining
- **Schema Generation**: Automatically generate JSON schemas for your YAML workflows

### Advanced YAML Capabilities

- **Variable Interpolation**: Use `${variable}` syntax with `.vars.yaml` files for dynamic content
- **File Includes**: Modular YAML composition with secure file inclusion
- **Real-Time Validation**: Immediate diagnostics for syntax errors, undefined variables, and
  structure issues

## 📋 Prerequisites

- **VS Code**: Version 1.75.0 or higher
- **Node.js**: Version 16 or higher
- **OpenRouter API Key**: Required for LLM features
  - Get your key from [https://openrouter.ai/keys](https://openrouter.ai/keys)
  - Set as environment variable: `OPENROUTER_KEY=your-api-key-here`

## 🛠️ Installation & Setup

1. **Clone and Install**

   ```bash
   git clone https://github.com/CUNYTechPrep/languageservices
   cd languageservices
   npm install
   ```

2. **Set API Key**

   ```bash
   # Linux/macOS
   export OPENROUTER_KEY="your-api-key-here"

   # Windows PowerShell
   $env:OPENROUTER_KEY="your-api-key-here"

   # Or add to .bashrc/.zshrc for persistence
   echo 'export OPENROUTER_KEY="your-api-key-here"' >> ~/.bashrc
   ```

3. **Build the Project**

   ```bash
   npm run compile
   ```

4. **Launch Development**
   - Open the project in VS Code
   - Press `F5` to launch the Extension Development Host
   - Open a `.yaml` file to activate the extension

## 📖 Usage

### 1. Generate YAML Workflow from Natural Language

Write your requirements in plain text and generate a structured workflow:

1. Create a new file with your requirements (e.g., `prompt.yaml`)
2. Write something like:
   ```
   Create a workout routine generator that:
   1. Takes user fitness level as input
   2. Generates 5 exercises with reps and sets
   3. Provides form tips for each exercise
   ```
3. Run command: **LSP: Generate Yaml Script**
4. View the generated YAML workflow and schema in the diff viewer

### 2. Refine Existing YAML Workflows

Improve your YAML scripts with AI assistance:

1. Open an existing YAML file
2. Run command: **LSP: Refine Yaml Script**
3. Enter your refinement instruction (e.g., "Add error handling" or "Include validation steps")
4. Review the improved workflow in the diff viewer

### 3. Test YAML Workflows

Execute your workflow and see results:

1. Open a YAML workflow file with `steps` array
2. Run command: **LSP: Test Yaml Script**
3. View execution results for each step in the interactive test results panel

### 4. Variable Interpolation

Create dynamic YAML using variables:

1. Create `.vars.yaml` in your workspace root:

   ```yaml
   userName: John Doe
   apiEndpoint: https://api.example.com
   timeout: 5000
   ```

2. Use variables in your YAML:

   ```yaml
   steps:
     - name: FetchData
       url: ${apiEndpoint}/users
       timeout: ${timeout}
       user: ${userName}
   ```

3. Variables are resolved automatically during validation and execution

### 5. File Includes

Organize workflows into reusable modules:

1. Create a shared configuration file (`config.yaml`):

   ```yaml
   retries: 3
   timeout: 5000
   logLevel: info
   ```

2. Include it in your workflow:
   ```yaml
   config:
     include: config.yaml # replaces with included file
   steps:
     - name: ProcessData
   ```

## 📁 Project Structure

```
lsp/
├── client/                    # VS Code Extension (Language Client)
│   ├── src/
│   │   ├── extension.ts       # Extension entry point & commands
│   │   ├── WebviewProvider.ts # Diff viewer for YAML comparison
│   │   ├── TestResultsWebviewProvider.ts  # Test results display
│   │   └── test/              # End-to-end integration tests
│   └── media/                 # CSS & JS for webviews
│
├── server/                    # Language Server
│   ├── src/
│   │   ├── server.ts          # LSP server & request handlers
│   │   ├── constants.ts       # Configuration constants
│   │   ├── types.ts           # TypeScript type definitions
│   │   ├── errorHandler.ts    # Structured error handling
│   │   ├── logger.ts          # Circular logging for LLM calls
│   │   ├── include.ts         # File inclusion with security
│   │   ├── YamlExecutor.ts    # Workflow execution engine
│   │   │
│   │   ├── expressions/       # Variable resolution
│   │   │   ├── resolve.ts     # Variable interpolation
│   │   │   └── utils.ts       # Expression parsing utilities
│   │   │
│   │   ├── llm/              # LLM Integration
│   │   │   ├── OpenRouterClient.ts    # OpenRouter API client
│   │   │   ├── YamlWorkflowBuilder.ts # YAML generation & refinement
│   │   │   └── utils.ts       # Code block parsing
│   │   │
│   │   └── test/             # Unit tests
│   │       ├── expressions.test.ts
│   │       ├── include.test.ts
│   │       └── llm-utils.test.ts
│   │
├── package.json              # Extension manifest & configuration
├── tsconfig.json            # TypeScript configuration
└── README.md               # This file
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run client integration tests
npm run test:client

# Run server unit tests
npm run test:server

# Watch mode for development
npm run watch
```

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

1. **Additional LLM Providers**: Support for OpenAI, Anthropic, Ollama, etc.
2. **Workflow Templates**: Pre-built templates for common use cases
3. **Timeout Handling**: Add request timeout configuration
4. **Dynamic Model Selection**: Runtime model configuration

## 📝 Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Format code
npm run format

# Lint code
npm run lint
npm run lint:fix
```

## 🙏 Acknowledgments

- Built on
  [VS Code Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- Powered by [OpenRouter](https://openrouter.ai/) for LLM integration

---

**Made with ❤️ for AI-powered development**
