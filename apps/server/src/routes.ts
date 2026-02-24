import { Router, type Router as RouterType } from 'express';
import db, { uid } from './db.js';
import { broadcast } from './sse.js';
import type { Provenance } from '@copilot-cli-board/shared';

const router: RouterType = Router();

// ── Helpers ──
function broadcastStats() {
  const columns = db.prepare('SELECT * FROM columns ORDER BY "order"').all() as any[];
  const stats = columns.map(col => {
    const { count } = db.prepare('SELECT COUNT(*) as count FROM cards WHERE columnId = ? AND archivedAt IS NULL').get(col.id) as { count: number };
    return { columnId: col.id, columnName: col.name, count };
  });
  broadcast('stats:updated', stats);
}

function getCardWithLabels(cardId: string) {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as any;
  if (!card) return null;
  const labels = db.prepare(
    `SELECT l.* FROM labels l JOIN card_labels cl ON cl.labelId = l.id WHERE cl.cardId = ?`
  ).all(cardId);
  return { ...card, provenance: JSON.parse(card.provenance), labels };
}

function maxOrder(columnId: string): number {
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) as m FROM cards WHERE columnId = ? AND archivedAt IS NULL').get(columnId) as { m: number };
  return row.m + 1;
}

// ── GET /api/health ──
router.get('/api/health', (_req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), cards: count, memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB' });
});

// ── GET /api/columns ──
router.get('/api/columns', (_req, res) => {
  const columns = db.prepare('SELECT * FROM columns ORDER BY "order"').all();
  res.json(columns);
});

// ── GET /api/board ──
router.get('/api/board', (_req, res) => {
  const includeArchived = _req.query.includeArchived === 'true';
  const columns = db.prepare('SELECT * FROM columns ORDER BY "order"').all();
  const whereClause = includeArchived ? '' : 'WHERE archivedAt IS NULL';
  const rawCards = db.prepare(`SELECT * FROM cards ${whereClause} ORDER BY "order"`).all() as any[];
  const cards = rawCards.map(c => {
    const labels = db.prepare(
      'SELECT l.* FROM labels l JOIN card_labels cl ON cl.labelId = l.id WHERE cl.cardId = ?'
    ).all(c.id);
    return { ...c, provenance: JSON.parse(c.provenance), labels };
  });
  const labels = db.prepare('SELECT * FROM labels ORDER BY name').all();
  res.json({ columns, cards, labels });
});

// ── GET /api/stats ──
router.get('/api/stats', (_req, res) => {
  const columns = db.prepare('SELECT * FROM columns ORDER BY "order"').all() as any[];
  const stats = columns.map(col => {
    const { count } = db.prepare('SELECT COUNT(*) as count FROM cards WHERE columnId = ? AND archivedAt IS NULL').get(col.id) as { count: number };
    return { columnId: col.id, columnName: col.name, count };
  });
  res.json(stats);
});

// ── POST /api/cards ──
router.post('/api/cards', (req, res) => {
  const { title, description = '', columnId, labels: labelNames = [], actor = 'system' } = req.body;
  if (!title || !columnId) { res.status(400).json({ error: 'title and columnId required' }); return; }

  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(columnId);
  if (!col) { res.status(400).json({ error: 'invalid columnId' }); return; }

  const id = uid();
  const order = maxOrder(columnId);
  db.prepare(
    `INSERT INTO cards (id, title, description, columnId, "order", lastUpdatedBy) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, title, description, columnId, order, actor);

  // Labels
  if (labelNames.length > 0) {
    setCardLabels(id, labelNames);
  }

  // Event
  insertEvent(id, 'card:created', actor, { title, columnId });

  const card = getCardWithLabels(id);
  broadcast('card:created', card);
  broadcastStats();
  res.status(201).json(card);
});

// ── PATCH /api/cards/:id ──
router.patch('/api/cards/:id', (req, res) => {
  const { id } = req.params;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as any;
  if (!card) { res.status(404).json({ error: 'not found' }); return; }

  const { title, description, columnId, order, actor, lastUpdatedBy } = req.body;
  const updatedBy = lastUpdatedBy || actor || 'system';
  const updates: string[] = [];
  const params: any[] = [];

  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (columnId !== undefined) {
    updates.push('columnId = ?');
    params.push(columnId);
    if (order === undefined) {
      updates.push('"order" = ?');
      params.push(maxOrder(columnId));
    }
  }
  if (order !== undefined) { updates.push('"order" = ?'); params.push(order); }
  updates.push("updatedAt = datetime('now')");
  updates.push('lastUpdatedBy = ?');
  params.push(updatedBy);
  params.push(id);

  db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  // Auto-record agent + infer skills from column transitions
  if (updatedBy !== 'system') {
    const current = db.prepare('SELECT provenance FROM cards WHERE id = ?').get(id) as any;
    const prov = JSON.parse(current.provenance || '{}');
    if (!prov.agentsInvolved) prov.agentsInvolved = [];
    if (!prov.skillsUsed) prov.skillsUsed = [];
    if (!prov.toolsUsed) prov.toolsUsed = [];

    // Record agent
    if (!prov.agentsInvolved.includes(updatedBy)) {
      prov.agentsInvolved.push(updatedBy);
    }

    // Infer skills from column transitions
    if (columnId !== undefined && columnId !== card.columnId) {
      const targetCol = db.prepare('SELECT name FROM columns WHERE id = ?').get(columnId) as any;
      if (targetCol) {
        const skillMap: Record<string, string> = {
          'In Progress': 'implementation',
          'Review': 'code-review',
          'Done': 'verification',
          'Blocked': 'triage',
        };
        const skill = skillMap[targetCol.name];
        if (skill && !prov.skillsUsed.includes(skill)) {
          prov.skillsUsed.push(skill);
        }
      }
    }

    db.prepare("UPDATE cards SET provenance = ? WHERE id = ?").run(JSON.stringify(prov), id);
  }

  const eventType = columnId !== undefined && columnId !== card.columnId ? 'card:moved' : 'card:updated';
  insertEvent(id, eventType, updatedBy, req.body);

  const updated = getCardWithLabels(id);
  broadcast(eventType, updated);
  broadcastStats();
  res.json(updated);
});

// ── GET /api/labels ──
router.get('/api/labels', (_req, res) => {
  const labels = db.prepare('SELECT * FROM labels ORDER BY name').all();
  res.json(labels);
});

// ── POST /api/labels ──
router.post('/api/labels', (req, res) => {
  const { name, color } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }

  const existing = db.prepare('SELECT * FROM labels WHERE name = ?').get(name);
  if (existing) { res.json(existing); return; }

  const id = uid();
  db.prepare('INSERT INTO labels (id, name, color) VALUES (?, ?, ?)').run(id, name, color ?? null);
  const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
  broadcast('label:created', label);
  res.status(201).json(label);
});

// ── PATCH /api/labels/:id ──
router.patch('/api/labels/:id', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (color !== undefined) { updates.push('color = ?'); params.push(color); }
  if (updates.length === 0) { res.status(400).json({ error: 'nothing to update' }); return; }
  params.push(id);
  db.prepare(`UPDATE labels SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
  if (!label) { res.status(404).json({ error: 'not found' }); return; }
  broadcast('label:updated', label);
  res.json(label);
});

// ── POST /api/cards/:id/labels ──
router.post('/api/cards/:id/labels', (req, res) => {
  const { id } = req.params;
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id);
  if (!card) { res.status(404).json({ error: 'not found' }); return; }
  const { labels: labelNames = [], actor = 'system' } = req.body;
  setCardLabels(id, labelNames);
  insertEvent(id, 'card:labels', actor, { labels: labelNames });
  const updated = getCardWithLabels(id);
  broadcast('card:labels', updated);
  res.json(updated);
});

// ── GET /api/events ──
router.get('/api/events', (req, res) => {
  const { cardId } = req.query;
  if (!cardId) { res.status(400).json({ error: 'cardId required' }); return; }
  const events = db.prepare('SELECT * FROM events WHERE cardId = ? ORDER BY timestamp').all(cardId);
  res.json(events.map((e: any) => ({ ...e, payload: JSON.parse(e.payload) })));
});

// ── POST /api/events ──
router.post('/api/events', (req, res) => {
  const { cardId, type, actor = 'system', payload = {} } = req.body;
  if (!cardId || !type) { res.status(400).json({ error: 'cardId and type required' }); return; }
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!card) { res.status(404).json({ error: 'card not found' }); return; }
  const id = uid();
  db.prepare('INSERT INTO events (id, type, cardId, actor, payload) VALUES (?, ?, ?, ?, ?)').run(id, type, cardId, actor, JSON.stringify(payload));
  const event = { id, type, cardId, actor, payload, timestamp: new Date().toISOString() };
  broadcast('event:created', event);
  res.status(201).json(event);
});

// ── POST /api/cards/:id/archive ──
router.post('/api/cards/:id/archive', (req, res) => {
  const { id } = req.params;
  const { reason = '', actor = 'system' } = req.body;
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id);
  if (!card) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare("UPDATE cards SET archivedAt = datetime('now'), archivedBy = ?, archiveReason = ?, updatedAt = datetime('now') WHERE id = ?").run(actor, reason, id);
  insertEvent(id, 'card:archived', actor, { reason });
  const updated = getCardWithLabels(id);
  broadcast('card:archived', updated);
  broadcastStats();
  res.json(updated);
});

// ── POST /api/cards/:id/unarchive ──
router.post('/api/cards/:id/unarchive', (req, res) => {
  const { id } = req.params;
  const { actor = 'system' } = req.body;
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id);
  if (!card) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare("UPDATE cards SET archivedAt = NULL, archivedBy = NULL, archiveReason = NULL, updatedAt = datetime('now') WHERE id = ?").run(id);
  insertEvent(id, 'card:unarchived', actor, {});
  const updated = getCardWithLabels(id);
  broadcast('card:unarchived', updated);
  broadcastStats();
  res.json(updated);
});

// ── POST /api/cards/:id/provenance ──
router.post('/api/cards/:id/provenance', (req, res) => {
  const { id } = req.params;
  const card = db.prepare('SELECT provenance FROM cards WHERE id = ?').get(id) as any;
  if (!card) { res.status(404).json({ error: 'not found' }); return; }

  const { addSkills = [], addInstructions = [], addTools = [], addAgents = [], actor = 'system' } = req.body;
  const prov: Provenance = JSON.parse(card.provenance);

  // Merge + dedupe
  prov.skillsUsed = [...new Set([...prov.skillsUsed, ...addSkills])];
  prov.instructionsUsed = [...new Set([...prov.instructionsUsed, ...addInstructions])];
  prov.toolsUsed = [...new Set([...prov.toolsUsed, ...addTools])];
  prov.agentsInvolved = [...new Set([...prov.agentsInvolved, ...addAgents])];

  db.prepare("UPDATE cards SET provenance = ?, lastUpdatedBy = ?, updatedAt = datetime('now') WHERE id = ?").run(JSON.stringify(prov), actor, id);
  insertEvent(id, 'card:provenance', actor, { addSkills, addInstructions, addTools, addAgents });

  broadcast('card:provenance', { cardId: id, provenance: prov });
  res.json(prov);
});

// ── GET /api/cards/:id/provenance ──
router.get('/api/cards/:id/provenance', (req, res) => {
  const card = db.prepare('SELECT provenance FROM cards WHERE id = ?').get(req.params.id) as any;
  if (!card) { res.status(404).json({ error: 'not found' }); return; }
  res.json(JSON.parse(card.provenance));
});

// ── Helpers ──
function setCardLabels(cardId: string, labelNames: string[]) {
  db.prepare('DELETE FROM card_labels WHERE cardId = ?').run(cardId);
  for (const name of labelNames) {
    let label = db.prepare('SELECT id FROM labels WHERE name = ?').get(name) as any;
    if (!label) {
      const id = uid();
      db.prepare('INSERT INTO labels (id, name) VALUES (?, ?)').run(id, name);
      label = { id };
    }
    db.prepare('INSERT OR IGNORE INTO card_labels (cardId, labelId) VALUES (?, ?)').run(cardId, label.id);
  }
}

function insertEvent(cardId: string, type: string, actor: string, payload: any) {
  const id = uid();
  db.prepare('INSERT INTO events (id, type, cardId, actor, payload) VALUES (?, ?, ?, ?, ?)').run(id, type, cardId, actor, JSON.stringify(payload));
}

export default router;
