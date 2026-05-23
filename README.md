# OpenAI-Compatible Qwen Bridge Service

A lightweight, secure, and modular bridge service written in Node.js that exposes an OpenAI-compatible API for Qwen models. It supports routing completions to either the local official **Qwen Code CLI** (`qwen-code-oauth`) or the **Alibaba Cloud Model Studio** (`model-studio`) API.

This bridge allows you to connect Qwen models directly to existing OpenAI-based client applications (like coding agents, IDE extensions, or custom scripts) with zero code modifications.

---

## 🔒 Security & Compliance

> [!IMPORTANT]
> **No Consumer-Web Scraping:** This bridge explicitly does **NOT** scrape `chat.qwen.ai`, does **NOT** reuse browser session cookies, and does **NOT** automate consumer accounts.
>
> Web scraping of consumer portals violates terms of service, leads to brittle integrations, and exposes session credentials. Instead, this bridge supports clean, official interfaces:
> 1. **Model Studio API:** Downstream forwarding via the official, paid enterprise API.
> 2. **Qwen Code CLI:** Local headless execution calling the official Node.js command-line interface under user authentication.

---

## 🛠️ Environment Configuration

Copy the `.env.example` file to `.env` and configure the variables:

```bash
cp .env.example .env
```

| Variable | Description | Default | Required? |
| :--- | :--- | :--- | :--- |
| `PORT` | Local port the bridge service will listen on. | `3000` | No |
| `QWEN_MODE` | The downstream backend mode: `qwen-code-oauth` or `model-studio`. | `qwen-code-oauth` | Yes |
| `QWEN_BINARY` | Path to the installed `qwen` CLI executable (in `qwen-code-oauth` mode). | `qwen` | No |
| `QWEN_BASE_URL` | Base URL of Model Studio compatible API (in `model-studio` mode). | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Yes (for model-studio) |
| `QWEN_API_KEY` | API Key for Model Studio (in `model-studio` mode). | - | Yes (for model-studio) |
| `DEFAULT_MODEL` | Default model ID if none is requested by the client. | `qwen3.6-plus` | No |
| `BRIDGE_API_KEY` | Bearer API Key protecting this bridge itself. | - | Recommended |
| `QWEN_MODELS` | Comma-separated list of allowed models. | A default list of Qwen models | No |
| `LOG_PROMPTS` | If `true`, prints incoming prompts and responses in the server logs. | `false` | No |

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js** v18 or later.
- For **`qwen-code-oauth`** mode: Install the official [Qwen Code CLI](https://github.com/QwenLM/qwen-code) and complete authentication using `/auth` in interactive mode first.

### Step 1: Install Dependencies
Navigate to the bridge directory and install required npm packages:
```bash
cd qwen-bridge
npm install
```

### Step 2: Start the Bridge Server
Run the Express application:
```bash
npm start
```
The server will boot and listen on the configured port (default `3000`).

---

## 🖥️ Usage Examples

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Model List (requires authentication)
```bash
curl -H "Authorization: Bearer your-secure-bridge-api-key-here" \
     http://localhost:3000/v1/models
```

### 3. Chat Completions (Non-Streaming)
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-bridge-api-key-here" \
  -d '{
    "model": "qwen3.6-plus",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain quantum computing in one sentence."}
    ],
    "stream": false
  }'
```

### 4. Chat Completions (Streaming)
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-bridge-api-key-here" \
  -d '{
    "model": "qwen3.6-plus",
    "messages": [
      {"role": "user", "content": "Count from 1 to 5."}
    ],
    "stream": true
  }'
```

---

## 🔌 SDK Integrations

### Python OpenAI SDK
```python
import os
from openai import OpenAI

client = OpenAI(
    api_key="your-secure-bridge-api-key-here",
    base_url="http://localhost:3000/v1"
)

response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[
        {"role": "user", "content": "Write a python function to check if a number is prime."}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Node.js OpenAI SDK
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'your-secure-bridge-api-key-here',
  baseURL: 'http://localhost:3000/v1'
});

const response = await openai.chat.completions.create({
  model: 'qwen3.6-plus',
  messages: [{ role: 'user', content: 'Say hello!' }],
  stream: false
});

console.log(response.choices[0].message.content);
```
