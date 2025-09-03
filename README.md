# AI Copilot Extension for VS Code

A comprehensive VS Code extension that provides AI-powered copilot capabilities and agentic abilities for autonomous code assistance.

## 🚀 Features

### 🤖 AI Copilot Capabilities
- **Intelligent Code Completion**: Context-aware code suggestions powered by OpenAI GPT models
- **Code Generation**: Generate code from natural language descriptions
- **Code Refactoring**: AI-powered code improvements and optimizations
- **Code Explanation**: Get detailed explanations of complex code blocks
- **Multi-language Support**: Works with TypeScript, JavaScript, Python, Java, and more

### 🎯 Agentic Abilities
- **Autonomous Code Analysis**: AI agents that can analyze entire codebases
- **Multi-step Task Execution**: Complex coding tasks with user oversight
- **Safety Controls**: User confirmation required for autonomous actions
- **Task Queue Management**: Monitor and control agent activities
- **Progress Tracking**: Real-time updates on agent task execution

### 💬 Chat Interface
- **Conversational AI Assistant**: Chat with AI about your code
- **Context Awareness**: AI understands your current file and selection
- **Code Snippet Integration**: Reference and discuss specific code blocks
- **Conversation History**: Persistent chat history across sessions

## 📦 Installation

### From VSIX File (Recommended)
1. Download the latest `ai-copilot-extension-1.0.0.vsix` from the [Releases](../../releases) page
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open Command Palette
4. Type "Extensions: Install from VSIX" and select it
5. Browse and select the downloaded VSIX file
6. Restart VS Code when prompted

### From VS Code Marketplace
*Coming soon - extension will be published to the marketplace*

## ⚙️ Configuration

### API Keys Setup
1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "AI Copilot"
3. Configure your API keys:
   - **OpenAI API Key**: Required for GPT models
   - **Anthropic API Key**: Optional, for Claude models

### Model Selection
Choose your preferred AI model:
- `gpt-4`: Most capable, slower, higher cost
- `gpt-3.5-turbo`: Fast, cost-effective (default)
- `claude-3-sonnet`: Alternative provider
- `local`: For local model endpoints

### Agentic Features
- **Enable Agentic Mode**: Toggle autonomous capabilities
- **Require User Approval**: Safety setting for agent actions
- **Max Task Steps**: Limit complexity of autonomous tasks

## 🎮 Usage

### Quick Start
1. **Code Generation**: Select text and press `Ctrl+Shift+G` (or `Cmd+Shift+G`)
2. **Open Chat**: Press `Ctrl+Shift+C` (or `Cmd+Shift+C`) or click the chat icon in the activity bar
3. **Explain Code**: Right-click on code → "Explain Code with AI"
4. **Refactor Code**: Right-click on code → "Refactor Code with AI"

### Commands
- `AI Copilot: Generate Code` - Generate code from description
- `AI Copilot: Explain Code` - Get code explanations
- `AI Copilot: Refactor Code` - Improve code quality
- `AI Copilot: Open Chat` - Start conversation with AI
- `AI Copilot: Toggle Agent Mode` - Enable/disable autonomous features

### Keybindings
- `Ctrl+Shift+G` / `Cmd+Shift+G`: Generate Code
- `Ctrl+Shift+C` / `Cmd+Shift+C`: Open Chat
- `Ctrl+Shift+E` / `Cmd+Shift+E`: Explain Code
- `Ctrl+Shift+R` / `Cmd+Shift+R`: Refactor Code

## 🏗️ Development

### Prerequisites
- Node.js 18+ and npm
- VS Code 1.74.0+
- TypeScript 4.9+

### Local Development
```bash
# Clone the repository
git clone https://github.com/your-username/ai-copilot-extension.git
cd ai-copilot-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run linting
npm run lint

# Package extension
npm run package
```

### Testing in Development Mode
1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Test the extension in the new VS Code window

### Build Commands
- `npm run compile` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode for development
- `npm run lint` - Run ESLint checks
- `npm run package` - Create VSIX package

## 🏛️ Architecture

### Core Components
```
src/
├── extension.ts          # Main extension entry point
├── commands/            # Command implementations
│   ├── generateCode.ts  # Code generation
│   ├── explainCode.ts   # Code explanation
│   ├── refactorCode.ts  # Code refactoring
│   └── index.ts         # Command registry
├── providers/           # AI service providers
│   ├── aiProvider.ts    # Abstract AI provider
│   ├── openaiProvider.ts # OpenAI integration
│   └── completionProvider.ts # Code completion
├── views/               # UI components
│   ├── chatPanel.ts     # Chat interface
│   └── agentPanel.ts    # Agent management
├── agents/              # Autonomous agents
│   ├── codeAgent.ts     # Code analysis agent
│   └── taskAgent.ts     # Task execution agent
└── utils/               # Utilities
    ├── config.ts        # Configuration management
    └── logger.ts        # Logging system
```

### Key Design Principles
- **Modular Architecture**: Easy to extend with new AI providers
- **Safety First**: User confirmation for autonomous actions
- **Performance**: Efficient code completion and caching
- **Privacy**: Configurable data handling and local model support

## 🔒 Privacy & Security

- **API Keys**: Stored securely in VS Code settings
- **Code Privacy**: Only selected code is sent to AI services
- **Local Models**: Support for on-premise AI models
- **User Control**: Granular permissions for agent actions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add comprehensive JSDoc comments
- Include unit tests for new features
- Update documentation for user-facing changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for GPT models and API
- Anthropic for Claude models
- VS Code team for excellent extension APIs
- The open-source community for inspiration and tools

## 📞 Support

- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)
- **Email**: support@ai-copilot-extension.com

---

**Made with ❤️ for developers who want AI-powered coding assistance**
