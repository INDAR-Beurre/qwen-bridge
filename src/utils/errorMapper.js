import { logger } from './logger.js';

export function mapHttpError(status, statusText, details = null) {
  let mappedStatus = status;
  let code = 'api_error';
  let type = 'api_error';
  let message = statusText || 'An error occurred with the downstream provider';

  if (status === 401) {
    mappedStatus = 401;
    code = 'invalid_api_key';
    type = 'invalid_request_error';
    message = 'Incorrect API key provided for the Qwen provider. Check your downstream QWEN_API_KEY setting.';
  } else if (status === 429) {
    mappedStatus = 429;
    code = 'rate_limit_exceeded';
    type = 'requests_rate_limit_exceeded';
    message = 'You have exceeded the rate limit for the Qwen provider. Please try again later.';
  } else if (status >= 500) {
    mappedStatus = 502; // Bad Gateway
    code = 'bad_gateway';
    type = 'api_error';
    message = `Downstream server returned a server error (${status}): ${statusText}`;
  }

  if (details) {
    message += ` Details: ${JSON.stringify(details)}`;
  }

  return {
    status: mappedStatus,
    body: {
      error: {
        message,
        type,
        param: null,
        code
      }
    }
  };
}

export function mapCliError(errMessage) {
  logger.error('CLI execution error mapped:', errMessage);
  let status = 500;
  let code = 'cli_error';
  let type = 'api_error';
  let message = errMessage || 'Failed to execute the Qwen Code CLI';

  if (errMessage.includes('discontinued') || errMessage.includes('discontinue')) {
    status = 401;
    code = 'qwen_oauth_discontinued';
    type = 'invalid_request_error';
    message = 'The Qwen OAuth free tier has been discontinued. Please authenticate via the official "/auth" flow in the Qwen Code CLI manually before running.';
  } else if (errMessage.includes('No auth type is selected') || errMessage.includes('Missing API key')) {
    status = 401;
    code = 'qwen_auth_not_configured';
    type = 'invalid_request_error';
    message = 'The Qwen Code CLI is not properly authenticated. Please run the CLI and authenticate first.';
  } else if (errMessage.includes('401') || errMessage.includes('Incorrect API key')) {
    status = 401;
    code = 'invalid_api_key';
    type = 'invalid_request_error';
    message = 'Qwen CLI returned 401: Authentication failed. Please check the API key configured in Qwen settings.';
  } else if (errMessage.includes('429') || errMessage.includes('Rate limit')) {
    status = 429;
    code = 'rate_limit_exceeded';
    type = 'requests_rate_limit_exceeded';
    message = 'Qwen CLI returned 429: Rate limit exceeded downstream.';
  } else if (errMessage.includes('500') || errMessage.includes('502') || errMessage.includes('503')) {
    status = 502;
    code = 'bad_gateway';
    type = 'api_error';
    message = `Qwen CLI encountered a downstream server error: ${errMessage}`;
  }

  return {
    status,
    body: {
      error: {
        message,
        type,
        param: null,
        code
      }
    }
  };
}
