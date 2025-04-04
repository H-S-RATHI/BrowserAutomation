# Browser Automation Tool

A powerful browser automation tool that uses native browser protocols and Google's Gemini AI for natural language processing of commands.

## Features

- Native browser control without third-party frameworks
- Natural language command processing using Google Gemini AI
- Web-based UI for command input
- Advanced form analysis and content extraction
- Entity recognition and content classification

## Prerequisites

- Node.js >= 18.17.0
- Google Gemini API key
- Modern web browser

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/browser-automation.git
cd browser-automation
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your Gemini API key:
```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to `http://localhost:3000`

3. Enter natural language commands in the UI, such as:
   - "Login to example.com with username 'user' and password 'pass'"
   - "Search for 'product' on amazon.com"
   - "Extract all product prices from the current page"

## API Endpoints

- `POST /api/command` - Process natural language commands
- `GET /api/status` - Get current automation status
- `POST /api/stop` - Stop current automation

## Development

Run tests:
```bash
npm test
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request 