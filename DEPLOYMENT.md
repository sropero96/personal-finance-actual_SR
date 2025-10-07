# 🚀 Deployment Guide - Actual Budget with PDF Importer

This guide explains how to deploy Actual Budget with Claude AI PDF Import to Fly.io using a split architecture.

## 📦 Architecture

```
┌─────────────────────────────┐      ┌──────────────────────────┐
│  Actual Budget              │      │  Agent Server            │
│  (actual-budget-sr)         │◄────►│  (actual-agent-sr)       │
│                             │ HTTPS │                          │
│  - Sync Server (port 5006)  │      │  - PDF Processing        │
│  - Web Client               │      │  - Claude API            │
│  - Transaction Import UI    │      │  - Port 4000             │
│  - Volume: /data            │      │                          │
└─────────────────────────────┘      └──────────────────────────┘
         ↓                                      ↓
  https://actual-budget-sr       https://actual-agent-sr
        .fly.dev                       .fly.dev
```

## 🔧 Prerequisites

```bash
# Install Fly.io CLI
curl -L https://fly.io/install.sh | sh

# Login to Fly.io
fly auth login
```

## 📝 Step-by-Step Deployment

### 1. Deploy Agent Server (First!)

The agent server must be deployed first so we can set its URL in Actual Budget config.

```bash
# Create the agent app
fly apps create actual-agent-sr

# Set Anthropic API key secret
fly secrets set -a actual-agent-sr VITE_ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Deploy agent server
fly deploy -c fly.agent.toml

# Verify it's running
fly status -a actual-agent-sr
curl https://actual-agent-sr.fly.dev/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "service": "Anthropic PDF Agent Server",
  "apiKeyConfigured": true
}
```

### 2. Deploy Actual Budget

```bash
# Create Actual Budget app
fly apps create actual-budget-sr

# Create persistent volume for user data
fly volumes create actualbudget_data -a actual-budget-sr --region iad --size 1

# Deploy Actual Budget
fly deploy -c fly.actual.toml

# Verify deployment
fly status -a actual-budget-sr
```

### 3. Verify Integration

1. Open https://actual-budget-sr.fly.dev
2. Create or open a budget
3. Go to any account → Import Transactions
4. Upload a PDF (Santander or Revolut)
5. You should see transactions extracted!

## 🔐 Environment Variables

### Actual Budget (actual-budget-sr)
- `ANTHROPIC_AGENT_URL` - Set in fly.actual.toml to agent server URL
- `ACTUAL_DATA_DIR=/data` - Volume mount path
- `NODE_ENV=production`

### Agent Server (actual-agent-sr)
- `VITE_ANTHROPIC_API_KEY` - **Required!** Set via `fly secrets set`
- `NODE_ENV=production`

## 📊 Monitoring & Logs

```bash
# View Actual Budget logs
fly logs -a actual-budget-sr

# View Agent Server logs
fly logs -a actual-agent-sr

# Check app status
fly status -a actual-budget-sr
fly status -a actual-agent-sr

# SSH into machines (if needed)
fly ssh console -a actual-budget-sr
fly ssh console -a actual-agent-sr
```

## 🔄 Updates & Redeployment

### Update Agent Server Only
```bash
# Make changes to anthropic-pdf-agent/
git add . && git commit -m "Update agent server"
fly deploy -c fly.agent.toml
```

### Update Actual Budget Only
```bash
# Make changes to packages/
git add . && git commit -m "Update Actual Budget"
fly deploy -c fly.actual.toml
```

### Update Both
```bash
git add . && git commit -m "Update both services"
fly deploy -c fly.agent.toml
fly deploy -c fly.actual.toml
```

## 🐛 Troubleshooting

### Agent Server Returns 500
```bash
# Check if API key is set
fly secrets list -a actual-agent-sr

# View detailed logs
fly logs -a actual-agent-sr
```

### Actual Budget Can't Connect to Agent
1. Verify agent server is running: `fly status -a actual-agent-sr`
2. Test agent health: `curl https://actual-agent-sr.fly.dev/health`
3. Check ANTHROPIC_AGENT_URL in fly.actual.toml
4. Redeploy Actual Budget: `fly deploy -c fly.actual.toml`

### Volume Issues
```bash
# List volumes
fly volumes list -a actual-budget-sr

# Delete and recreate (⚠️ deletes all data!)
fly volumes destroy vol_xxxxx -a actual-budget-sr
fly volumes create actualbudget_data -a actual-budget-sr --region iad --size 1
```

## 💰 Cost Estimation

**Free Tier:**
- Both apps run on Fly.io free tier
- Auto-stop when idle (min_machines_running = 0)
- 1GB volume included
- Pay only for usage

**Expected Monthly Cost:** ~$0-5/month (depending on usage)

## 🔒 Security Notes

1. **API Key Management**: VITE_ANTHROPIC_API_KEY is stored as Fly.io secret (encrypted)
2. **HTTPS Only**: Both apps enforce HTTPS via fly.toml
3. **CORS**: Agent server has CORS enabled for Actual Budget origin
4. **Network**: Both apps can communicate via public HTTPS (no private networking needed)

## 📚 Files Reference

- `Dockerfile.actual` - Actual Budget container
- `Dockerfile.agent` - Agent server container
- `fly.actual.toml` - Actual Budget Fly.io config
- `fly.agent.toml` - Agent server Fly.io config
- `claude-pdf-processor.ts` - Integration code (uses ANTHROPIC_AGENT_URL)

## ✅ Success Checklist

- [ ] Agent server deployed and health check passes
- [ ] Actual Budget deployed successfully
- [ ] Can access Actual Budget UI
- [ ] Can create/open a budget
- [ ] PDF upload shows in Import UI
- [ ] Transactions are extracted from PDF
- [ ] Transactions can be imported

---

**Questions?** Check logs first: `fly logs -a <app-name>`
