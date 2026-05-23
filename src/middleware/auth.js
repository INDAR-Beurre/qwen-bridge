export function authMiddleware(req, res, next) {
  // Authentication disabled
  return next();
}
