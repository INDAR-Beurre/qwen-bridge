import config from '../config.js';

export const logger = {
  info(...args) {
    console.log(`[INFO] [${new Date().toISOString()}]`, ...args);
  },
  warn(...args) {
    console.warn(`[WARN] [${new Date().toISOString()}]`, ...args);
  },
  error(...args) {
    console.error(`[ERROR] [${new Date().toISOString()}]`, ...args);
  },
  logPrompt(endpoint, payload) {
    if (config.logPrompts) {
      console.log(`[PROMPT] [${endpoint}] [${new Date().toISOString()}] Payload:`, JSON.stringify(payload, null, 2));
    }
  },
  logResponse(endpoint, response) {
    if (config.logPrompts) {
      console.log(`[RESPONSE] [${endpoint}] [${new Date().toISOString()}] Response:`, JSON.stringify(response, null, 2));
    }
  }
};
