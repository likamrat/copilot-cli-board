import type { Request, Response, NextFunction } from 'express';

const TOKEN = process.env.COPILOT_CLI_BOARD_TOKEN;

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!TOKEN) return next();
  if (req.method === 'GET') return next();

  const auth = req.headers.authorization;
  if (auth === `Bearer ${TOKEN}`) return next();

  res.status(401).json({ error: 'Unauthorized' });
}
