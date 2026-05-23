import express from 'express';
import config from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { handleModelStudio } from './adapters/modelStudio.js';
import { handleQwenCodeCli } from './adapters/qwenCodeCli.js';
import { logger } from './utils/logger.js';

const app = express();
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// /health endpoint - unprotected
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mode: config.mode,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// /v1/models endpoint - unprotected/protected depending on choice, standard OpenAI client might call it, so let's allow it protected or unprotected?
// Let's make /v1/models require auth for consistency with OpenAI, or allow it unprotected? Standard is protected. Let's apply authMiddleware.
app.get('/v1/models', authMiddleware, (req, res) => {
  const models = config.allowedModels.map(modelId => ({
    id: modelId,
    object: 'model',
    created: 1677858207,
    owned_by: 'qwen'
  }));

  res.json({
    object: 'list',
    data: models
  });
});

// /v1/chat/completions endpoint - protected
app.post('/v1/chat/completions', authMiddleware, async (req, res) => {
  const payload = req.body;

  logger.logPrompt('/v1/chat/completions', payload);

  // Validate inputs
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid request: "messages" is required and must be a non-empty array.',
        type: 'invalid_request_error',
        param: 'messages',
        code: 'messages_required'
      }
    });
  }

  // Model validation
  const modelName = payload.model || config.defaultModel;
  if (!config.allowedModels.includes(modelName)) {
    return res.status(400).json({
      error: {
        message: `Model "${modelName}" is not in the allowlist of configured models: ${config.allowedModels.join(', ')}`,
        type: 'invalid_request_error',
        param: 'model',
        code: 'model_not_allowed'
      }
    });
  }

  // Call the appropriate backend
  if (config.mode === 'model-studio') {
    await handleModelStudio(req, res, payload);
  } else if (config.mode === 'qwen-code-oauth') {
    await handleQwenCodeCli(req, res, payload);
  } else {
    logger.error(`Invalid backend configuration: ${config.mode}`);
    res.status(500).json({
      error: {
        message: 'Invalid bridge configuration: downstream provider mode not supported.',
        type: 'api_error',
        param: null,
        code: 'internal_server_error'
      }
    });
  }
});

// Start the server
const server = app.listen(config.port, () => {
  logger.info(`OpenAI-compatible Qwen bridge service started successfully!`);
  logger.info(`Running on port: ${config.port}`);
  logger.info(`Backend mode: ${config.mode}`);
  logger.info(`Default model: ${config.defaultModel}`);
  logger.info(`Configured models allowlist: ${config.allowedModels.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});
