import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  mode: process.env.QWEN_MODE || 'qwen-code-oauth', // 'qwen-code-oauth' | 'model-studio' | 'puter'
  qwenBinary: process.env.QWEN_BINARY || 'qwen',
  qwenBaseUrl: process.env.QWEN_BASE_URL,
  qwenApiKey: process.env.QWEN_API_KEY,
  defaultModel: process.env.DEFAULT_MODEL || 'qwen3.6-plus',
  bridgeApiKey: process.env.BRIDGE_API_KEY,
  puterAuthToken: process.env.PUTER_AUTH_TOKEN,
  logPrompts: process.env.LOG_PROMPTS === 'true',
  allowedModels: (process.env.QWEN_MODELS || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean)
};

// Validate config
if (!config.bridgeApiKey) {
  console.warn('WARNING: BRIDGE_API_KEY is not set. The bridge is currently unprotected!');
}

if (config.mode === 'model-studio') {
  if (!config.qwenBaseUrl) {
    throw new Error('QWEN_BASE_URL is required when QWEN_MODE is set to model-studio');
  }
  if (!config.qwenApiKey) {
    throw new Error('QWEN_API_KEY is required when QWEN_MODE is set to model-studio');
  }
} else if (config.mode !== 'qwen-code-oauth' && config.mode !== 'puter') {
  throw new Error(`Invalid QWEN_MODE: ${config.mode}. Must be "qwen-code-oauth", "model-studio", or "puter"`);
}

// Fallback allowlist if none configured
if (config.allowedModels.length === 0) {
  config.allowedModels = [
    'qwen3.5-plus',
    'qwen3.6-plus',
    'qwen3.5-coder',
    'qwen-turbo',
    'qwen-plus',
    'qwen-max',
    'moonshotai/kimi-k2.6'
  ];
}

export default config;
