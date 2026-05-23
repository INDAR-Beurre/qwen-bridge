import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import config from '../config.js';
import { serializeChunk, serializeCompletion } from '../utils/serializer.js';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const { init } = require('@heyputer/puter.js/src/init.cjs');

const clientCache = new Map();

function getPuterClient(req) {
  let token = null;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const extracted = authHeader.substring(7).trim();
    // Bypasses generic dummy tokens, placeholder values, and the bridge API key to use .env fallback
    if (
      extracted && 
      !extracted.startsWith('sk-') && 
      extracted !== 'placeholder' && 
      extracted !== config.bridgeApiKey
    ) {
      token = extracted;
    }
  }
  
  // Use config's puterAuthToken if loaded, or standard process environment
  token = token || config.puterAuthToken || process.env.PUTER_AUTH_TOKEN;
  
  if (!token) {
    throw new Error("Puter Authentication Token missing. Provide your token in the 'Authorization: Bearer <token>' header or set PUTER_AUTH_TOKEN in config/.env");
  }
  
  if (!clientCache.has(token)) {
    clientCache.set(token, init(token));
  }
  return clientCache.get(token);
}

// Convert message arrays to Puter.js schema formats (e.g. handle image urls)
function mapMessages(messages) {
  if (!Array.isArray(messages)) return [];
  
  return messages.map(msg => {
    if (Array.isArray(msg.content)) {
      const mappedContent = [];
      msg.content.forEach(part => {
        if (part.type === 'text') {
          mappedContent.push(part.text);
        } else if (part.type === 'image_url') {
          mappedContent.push({ image_url: { url: part.image_url.url } });
        } else {
          mappedContent.push(part);
        }
      });
      return { role: msg.role, content: mappedContent };
    }
    return { role: msg.role, content: msg.content };
  });
}

export async function handlePuter(req, res, payload) {
  let puter;
  try {
    puter = getPuterClient(req);
  } catch (err) {
    logger.error("Puter Auth Error:", err);
    return res.status(401).json({
      error: {
        message: err.message,
        type: 'invalid_request_error',
        param: null,
        code: 'missing_authorization'
      }
    });
  }

  const rawModel = payload.model || config.defaultModel;
  let modelName = rawModel;
  if (modelName.startsWith('qwen') && !modelName.startsWith('qwen/')) {
    modelName = 'qwen/' + modelName;
  }
  const requestId = `chatcmpl-${randomUUID()}`;
  const mappedMsgs = mapMessages(payload.messages);
  
  const chatOptions = {
    model: modelName,
    stream: !!payload.stream
  };

  if (payload.temperature !== undefined) chatOptions.temperature = payload.temperature;
  if (payload.max_tokens !== undefined) chatOptions.max_tokens = payload.max_tokens;

  logger.info(`Routing request to Puter.js: model=${modelName}, stream=${chatOptions.stream}`);

  try {
    if (payload.stream) {
      // 1. Get the stream first to catch any immediate errors (like insufficient funds, network/auth errors) before sending headers
      const responseStream = await puter.ai.chat(mappedMsgs, chatOptions);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial role chunk
      const roleChunk = serializeChunk(requestId, modelName, null, null);
      roleChunk.choices[0].delta = { role: 'assistant' };
      res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

      for await (const chunk of responseStream) {
        const text = chunk?.text || "";
        const reasoning = chunk?.reasoning || "";

        const delta = {};
        if (text) delta.content = text;
        if (reasoning) delta.reasoning_content = reasoning;

        if (text || reasoning) {
          const streamChunk = serializeChunk(requestId, modelName, null);
          streamChunk.choices[0].delta = delta;
          res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
        }
      }

      const stopChunk = serializeChunk(requestId, modelName, null, 'stop');
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else if (modelName.includes('qwen3.7-max')) {
      // Handle Qwen 3.7 Max streaming-only requirement by streaming internally and aggregating
      chatOptions.stream = true;
      const responseStream = await puter.ai.chat(mappedMsgs, chatOptions);
      let fullText = "";
      let fullReasoning = "";

      for await (const chunk of responseStream) {
        fullText += chunk?.text || "";
        fullReasoning += chunk?.reasoning || "";
      }

      const responseBody = serializeCompletion(requestId, modelName, fullText, {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      });

      if (fullReasoning) {
        responseBody.choices[0].message.reasoning_content = fullReasoning;
      }

      res.json(responseBody);
    } else {
      // Default non-streaming JSON completion
      const response = await puter.ai.chat(mappedMsgs, chatOptions);
      const content = response.message?.content || response.toString() || "";
      const reasoning = response.message?.reasoning || response.reasoning || null;

      const usage = response.usage ? {
        prompt_tokens: response.usage.prompt_tokens || 0,
        completion_tokens: response.usage.completion_tokens || 0,
        total_tokens: (response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0)
      } : null;

      const responseBody = serializeCompletion(requestId, modelName, content, usage);
      if (reasoning) {
        responseBody.choices[0].message.reasoning_content = reasoning;
      }

      res.json(responseBody);
    }
  } catch (error) {
    logger.error("Puter AI completions error:", error);
    if (res.headersSent) {
      // If headers were already sent, write an error chunk to the stream and end it
      const errorPayload = {
        error: {
          message: error.message || "Puter AI execution failed.",
          type: 'api_error',
          param: null,
          code: error.code || 'internal_server_error'
        }
      };
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(500).json({
        error: {
          message: error.message || "Puter AI execution failed.",
          type: 'api_error',
          param: null,
          code: error.code || 'internal_server_error'
        }
      });
    }
  }
}
