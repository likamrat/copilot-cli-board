import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import { addClient } from './sse.js';
import { authMiddleware } from './auth.js';
import db from './db.js';

const PORT = Number(process.env.PORT ?? 4800);
const UI_ORIGIN = process.env.UI_ORIGIN ?? 'http://localhost:5173';

const app = express();

app.use(cors({ origin: [UI_ORIGIN, 'http://127.0.0.1:5173'], credentials: true }));
app.use(express.json());
app.use(authMiddleware);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms origin=${req.headers.origin || 'none'}`);
  });
  next();
});

// SSE stream
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':\n\n'); // comment to keep alive
  addClient(res);
});

app.use(routes);

// Global error handler: returns JSON instead of HTML stack traces
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`
🏗️  Copilot CLI Board
   ├─ URL:    http://127.0.0.1:${PORT}
   ├─ Auth:   ${process.env.COPILOT_CLI_BOARD_TOKEN ? 'enabled (token set)' : 'disabled'}
   └─ Data:   ${process.env.DATA_DIR ?? '.copilot-cli-board/'}
`);
});

// Checkpoint WAL every 30s so data survives tsx watch restarts
const walTimer = setInterval(() => {
  try { db.pragma('wal_checkpoint(PASSIVE)'); } catch {}
}, 30_000);

// Graceful shutdown: checkpoint WAL and close DB before exit
function shutdown() {
  clearInterval(walTimer);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
