import config from '../config.js';
import { mapHttpError } from '../utils/errorMapper.js';
import { logger } from '../utils/logger.js';

export async function handleModelStudio(req, res, payload) {
  const targetUrl = `${config.qwenBaseUrl}/chat/completions`;
  logger.info(`Forwarding request to Model Studio: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.qwenApiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorData = null;
      try {
        errorData = await response.json();
      } catch (e) {
        try {
          errorData = await response.text();
        } catch (e2) {
          // ignore
        }
      }
      const mapped = mapHttpError(response.status, response.statusText, errorData);
      return res.status(mapped.status).json(mapped.body);
    }

    if (payload.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      req.on('close', () => {
        reader.cancel().catch(() => {});
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (err) {
        logger.error('Streaming error in model-studio:', err);
      } finally {
        res.end();
      }
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    logger.error('Error contacting Model Studio:', error);
    const mapped = mapHttpError(500, error.message);
    res.status(mapped.status).json(mapped.body);
  }
}
