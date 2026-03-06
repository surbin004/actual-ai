# Actual-AI (Ollama/Mistral-Nemo Edition)

A professional-grade fork of `sakowicz/actual-ai` optimized for self-hosted LLMs. This version is specifically tuned for **Mistral-Nemo** and **Ollama** to provide an automated, human-in-the-loop bookkeeping experience on your local network.

## 🚀 Key Enhancements
- **"Sorting Bin" Workflow**: Automatically processes any transaction assigned to the manual **"AI-Classify"** category.
- **Payee Sanitization**: Built-in Regex engine strips bank "junk" (dates, transaction IDs, auth codes) before the AI sees it, significantly increasing accuracy.
- **On-Budget Safety Gate**: Automatically skips tracking/off-budget accounts (401k, Brokerage, Mortgage) to protect your net worth reporting.
- **Double-Tag Review System**: 
    - **#ai-worked ✅**: High-confidence matches (over 85%) are processed and tagged for quick confirmation.
    - **#ai-review ❓**: Low-confidence items are tagged for manual auditing. Search for these tags in Actual Budget to filter your review queue.
- **Non-Destructive Notes**: AI reasoning and confidence scores are **appended** to existing transaction notes, preserving your original data.
- **NPM 11 + Node 22**: Modernized Docker build for better performance on N100/Proxmox hardware.
- **Mirror-Strict Transfer Linking**: Automatically bridges transfers between accounts by finding matching "mirror" amounts within a 5-day window. This prevents bank lag from causing misses while ensuring non-transfer items (like dividends) remain untouched.
- **"Sorting Bin" Workflow**: Automatically processes any transaction assigned to the manual **"AI-Classify"** category.
- **Payee Sanitization**: Built-in Regex engine strips bank "junk" (dates, transaction IDs, auth codes) to increase AI accuracy.
- **Double-Tag Review**: High-confidence matches are tagged `#ai-worked`, while low-confidence items are tagged `#ai-review` for manual auditing.
- **On-Budget Safety Gate**: Automatically skips off-budget/tracking accounts.

## 🛠 Configuration (Environment Variables)

Set these in your **Portainer Stack** or `docker-compose.yml`:


| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `OLLAMA_BASE_URL` | Yes | Your Ollama API endpoint (no /api suffix) | `your-ollama-ip:11434` |
| `AI_MODEL` | Yes | Your Ollama model name | `mistral-nemo` |
| `ACTUAL_SERVER_URL`| Yes | URL of your Actual server (no trailing slash) | `your-actual-server-ip:5006` |
| `ACTUAL_SERVER_PASSWORD` | Yes | Your Actual Budget server login | `your_login_password` |
| `ACTUAL_PASSWORD` | Yes | Your Budget Encryption/File Password | `your_sync_password` |
| `ACTUAL_BUDGET_ID` | Yes | The **Sync ID** from Advanced Settings | `fc3825fd-b982-4b72...` |
| `CRON_SCHEDULE` | No | Sync frequency (Cron syntax) | `0 */4 * * *` (Every 4 hours) |

## 📖 How to Use the "Sorting Bin"
1. In your **Actual Budget** web UI, create a new category named exactly **`AI-Classify`** (case sensitive).
2. To trigger a manual AI categorization, simply change any transaction's category to **`AI-Classify`**.
3. On the next sync, the AI will:
    - Identify the merchant (e.g., "Speedway" -> "Gas").
    - Replace `AI-Classify` with the correct category ID.
    - Append its reasoning and a tag (`#ai-worked` or `#ai-review`) to the notes.

## 📦 Docker Deployment (Portainer/Docker Compose)

```yaml
services:
  actual-ai:
    image: ghcr.io/surbin004/actual-ai:master
    container_name: actual-ai
    restart: unless-stopped
    environment:
      - ACTUAL_SERVER_URL=http://your-actual-server-up:5006
      - OLLAMA_BASE_URL=http://your-ollama-ip:11434
      - ACTUAL_SERVER_PASSWORD=${ACTUAL_PASSWORD}
      - ACTUAL_PASSWORD=${ACTUAL_PASSWORD}
      - ACTUAL_BUDGET_ID=${ACTUAL_BUDGET_ID}
      - AI_MODEL=mistral-nemo
      - NODE_TLS_REJECT_UNAUTHORIZED=0
      - CRON_SCHEDULE=0 */4 * * *
