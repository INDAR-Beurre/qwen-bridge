import { spawn } from 'child_process';
import readline from 'readline';
import { randomUUID } from 'crypto';
import config from '../config.js';
import { serializeMessages, serializeChunk, serializeCompletion } from '../utils/serializer.js';
import { mapCliError } from '../utils/errorMapper.js';
import { logger } from '../utils/logger.js';

export async function handleQwenCodeCli(req, res, payload) {
  const { systemPrompt, promptText } = serializeMessages(payload.messages);
  const modelName = payload.model || config.defaultModel;
  const requestId = `chatcmpl-${randomUUID()}`;

  const qwenBinary = config.qwenBinary;
  const args = [
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--bare',
    '--exclude-tools', '*'
  ];

  if (modelName) {
    args.push('--model', modelName);
  }
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  logger.info(`Spawning Qwen Code CLI: ${qwenBinary} ${args.join(' ')}`);

  let child;
  try {
    child = spawn(qwenBinary, args);
  } catch (err) {
    logger.error('Failed to spawn Qwen Code CLI process:', err);
    const mapped = mapCliError(`Failed to start Qwen CLI binary "${qwenBinary}": ${err.message}`);
    return res.status(mapped.status).json(mapped.body);
  }

  let isHeadersSent = false;
  let accumulatedText = '';
  let finalUsage = null;
  let cliErrorOccurred = false;
  let cliErrorMessage = '';

  // Setup readline interface for stdout
  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  // Setup readline for stderr to capture logs or error messages
  const rlErr = readline.createInterface({
    input: child.stderr,
    crlfDelay: Infinity
  });

  rlErr.on('line', (line) => {
    logger.warn(`Qwen CLI Stderr: ${line}`);
    if (!line.includes('[INFO]') && !line.includes('[DEBUG]')) {
      cliErrorMessage += line + '\n';
    }
  });

  // Handle spawn error (e.g. command not found)
  child.on('error', (err) => {
    logger.error('Qwen CLI Process Error Event:', err);
    cliErrorOccurred = true;
    if (!isHeadersSent) {
      isHeadersSent = true;
      const mapped = mapCliError(`Qwen CLI execution error: ${err.message}`);
      res.status(mapped.status).json(mapped.body);
    }
  });

  if (payload.stream) {
    req.on('close', () => {
      logger.info('Client closed connection. Killing Qwen CLI process.');
      child.kill('SIGINT');
    });
  }

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    logger.info(`Qwen CLI event line: ${trimmed}`);

    try {
      const eventObj = JSON.parse(trimmed);

      // 1. Handle initialization or system events (ignore unless they represent errors)
      if (eventObj.type === 'system' && eventObj.subtype === 'init') {
        return;
      }

      // 2. Handle stream events
      if (eventObj.type === 'stream_event' && eventObj.event) {
        const event = eventObj.event;

        if (event.type === 'content_block_delta' && event.delta?.text) {
          const deltaText = event.delta.text;
          accumulatedText += deltaText;

          if (payload.stream) {
            if (!isHeadersSent) {
              isHeadersSent = true;
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
            }
            const chunk = serializeChunk(requestId, modelName, deltaText);
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        }
        return;
      }

      // 3. Handle assistant message events (we can use delta instead to accumulate text, but good to know)
      if (eventObj.type === 'assistant') {
        // Accumulate final check just in case, but delta handles streaming
        return;
      }

      // 4. Handle final result (success or error)
      if (eventObj.type === 'result') {
        if (eventObj.is_error) {
          cliErrorOccurred = true;
          const errMsg = eventObj.error?.message || 'Unknown CLI execution error';
          logger.error(`Qwen CLI reported result error: ${errMsg}`);
          if (!isHeadersSent) {
            isHeadersSent = true;
            const mapped = mapCliError(errMsg);
            res.status(mapped.status).json(mapped.body);
          }
          child.kill('SIGTERM');
          return;
        }

        // Success result
        if (eventObj.usage) {
          finalUsage = {
            prompt_tokens: eventObj.usage.input_tokens || 0,
            completion_tokens: eventObj.usage.output_tokens || 0,
            total_tokens: eventObj.usage.total_tokens || 0
          };
        }
      }
    } catch (e) {
      logger.error('Failed to parse CLI output line as JSON:', trimmed, e);
    }
  });

  // Send input prompt to CLI stdin
  const inputMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: promptText
    }
  };

  child.stdin.write(JSON.stringify(inputMessage) + '\n');
  child.stdin.end();

  // Handle process completion
  child.on('close', (code) => {
    logger.info(`Qwen CLI process exited with code ${code}`);

    if (cliErrorOccurred) {
      // Error was already handled above
      return;
    }

    if (code !== 0 && !isHeadersSent) {
      isHeadersSent = true;
      const errMsg = cliErrorMessage.trim() || `CLI exited with non-zero code ${code}`;
      const mapped = mapCliError(errMsg);
      return res.status(mapped.status).json(mapped.body);
    }

    if (payload.stream) {
      if (!isHeadersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }
      // Send final stop chunk
      const finalChunk = serializeChunk(requestId, modelName, null, 'stop');
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const responseBody = serializeCompletion(requestId, modelName, accumulatedText, finalUsage);
      res.json(responseBody);
    }
  });
}
