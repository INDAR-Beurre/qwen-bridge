import config from '../config.js';

export function authMiddleware(req, res, next) {
  // If no API key is configured on the bridge, allow requests
  if (!config.bridgeApiKey) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: 'Missing Authorization header. Expose the bearer token as "Authorization: Bearer <key>".',
        type: 'invalid_request_error',
        param: null,
        code: 'missing_authorization'
      }
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token !== config.bridgeApiKey) {
    return res.status(401).json({
      error: {
        message: 'Incorrect API key provided. Check the BRIDGE_API_KEY in your configuration.',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key'
      }
    });
  }

  next();
}
