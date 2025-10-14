# Anthropic Agent Server

Node.js server for AI-powered PDF processing and transaction categorization using Claude AI.

## Architecture

This server implements the [Anthropic Agent Architecture](https://www.anthropic.com/engineering/building-effective-agents) with two agents:

- **Agent 1 (PDF Parser)**: Extracts transactions from bank statement PDFs
- **Agent 2 (Category Suggester)**: Suggests transaction categories based on history and rules

## Quick Start

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Get your API key from: https://console.anthropic.com/settings/keys

### 3. Start Server

```bash
yarn start       # Production mode
yarn dev         # Development mode (auto-restart)
```

Server runs on: http://localhost:4000

## Endpoints

### Agent 1: PDF Processing

```
POST /api/process-pdf
Content-Type: multipart/form-data

Body:
- file: PDF file (bank statement)

Response:
{
  "success": true,
  "bankName": "Santander España",
  "accountNumber": "ES24...",
  "transactions": [
    {
      "date": "2025-07-17",
      "payee": "La Mina, Madrid",
      "notes": "Pago Movil En La Mina, Madrid",
      "amount": -41.80,
      "confidence": 0.95
    }
  ],
  "totalTransactionsFound": 28,
  "extractionComplete": true
}
```

### Agent 2: Category Suggestions

```
POST /api/suggest-categories
Content-Type: application/json

Body:
{
  "transactions": [...],
  "categories": [...],
  "rules": [...],
  "historicalTransactions": [...]
}

Response:
{
  "success": true,
  "suggestions": [
    {
      "transaction_id": "tx1",
      "category": "Food & Dining",
      "categoryId": "cat123",
      "confidence": 0.95,
      "reasoning": "Frequent restaurant visits",
      "source": "history"
    }
  ]
}
```

### Health Check

```
GET /health

Response:
{
  "status": "healthy",
  "service": "Anthropic PDF Agent Server",
  "apiKeyConfigured": true
}
```

## Configuration Validation

The server uses **fail-fast configuration validation**:

- ✅ Validates required environment variables on startup
- ✅ Checks API key format
- ✅ Provides clear error messages if misconfigured
- ✅ Prevents running with invalid configuration

If configuration is invalid, the server will **refuse to start** and display helpful error messages.

## Production Deployment (Fly.io)

### Set Secrets

```bash
fly secrets set VITE_ANTHROPIC_API_KEY=sk-ant-... -a actual-agent-sr
```

### Deploy

```bash
fly deploy -c ../fly.agent.toml
```

### Check Status

```bash
fly status -a actual-agent-sr
fly logs -a actual-agent-sr
```

## Supported Banks

Currently configured for Spanish banks:

- **Santander España** - Full transaction extraction with location-based payee curation
- **Revolut España** - International merchant names, multi-currency support

## Processing Capacity

- **Transactions per PDF**: 10-100+
- **PDF size limit**: 10 MB
- **Processing time**: 15-45 seconds
- **Model**: claude-3-5-sonnet-20241022

## Troubleshooting

### "Missing required environment variables"

Create `.env` file with your API key:

```bash
cp .env.example .env
# Edit .env and add your key
```

### "Invalid Anthropic API key format"

API key must start with `sk-ant-`. Get a valid key from https://console.anthropic.com/settings/keys

### "Could not resolve authentication method"

Server is running without API key. Check:
1. `.env` file exists with valid key
2. Server was restarted after adding `.env`
3. For Fly.io: secret is set with `fly secrets set`

## Development

### File Structure

```
anthropic-pdf-agent/
├── server.js           # Main server with both agents
├── package.json        # Dependencies
├── .env.example        # Environment template
├── .env                # Your local config (git-ignored)
├── uploads/            # Temporary PDF uploads (git-ignored)
└── README.md           # This file
```

### Scripts

- `yarn start` - Start production server
- `yarn dev` - Start with auto-restart (nodemon)

## References

- [Anthropic Agent Architecture](https://www.anthropic.com/engineering/building-effective-agents)
- [Claude API Docs](https://docs.anthropic.com/en/api/messages)
- [PDF Document Support](https://docs.anthropic.com/en/docs/build-with-claude/vision#document-support)
