#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.COPILOT_CLI_BOARD_URL ?? 'http://127.0.0.1:4800';
const TOKEN = process.env.COPILOT_CLI_BOARD_TOKEN;
const LOG_DIR = path.resolve('.copilot-cli-board');
const LOG_FILE = path.join(LOG_DIR, 'mcp.log');

// Ensure log directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

function log(level: 'INFO' | 'WARN' | 'ERROR', tool: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  const line = data !== undefined
    ? `[${ts}] ${level} [${tool}] ${msg} ${JSON.stringify(data)}`
    : `[${ts}] ${level} [${tool}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Auto-record which MCP tool was used on a card
async function recordToolUsage(cardId: string, toolName: string, actor: string) {
  try {
    await api(`/api/cards/${cardId}/provenance`, 'POST', {
      addTools: [toolName],
      actor,
    });
    log('INFO', toolName, `recorded tool usage for card ${cardId}`, { actor });
  } catch (err) {
    log('WARN', toolName, `failed to record tool usage for card ${cardId}`, { error: String(err) });
  }
}

async function api(path: string, method = 'GET', body?: unknown, retries = 3): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return res.json();
      const text = await res.text();
      // Retry on 404/503 (server may be restarting)
      if ((res.status === 404 || res.status === 503) && attempt < retries) {
        log('WARN', 'api', `${method} ${path} → ${res.status}, retry ${attempt}/${retries}...`, { status: res.status });
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      const err = `API ${method} ${path} → ${res.status}: ${text}`;
      log('ERROR', 'api', err, { method, path, status: res.status });
      throw new Error(err);
    } catch (e: any) {
      // Retry on connection errors (server restarting)
      if (e.cause?.code === 'ECONNREFUSED' && attempt < retries) {
        log('WARN', 'api', `${method} ${path} → ECONNREFUSED, retry ${attempt}/${retries}...`, {});
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      if (!e.message?.startsWith('API ')) {
        log('ERROR', 'api', `${method} ${path} → ${e.message}`, { method, path });
      }
      throw e;
    }
  }
}

// Resolve column name → id
async function resolveColumn(nameOrId: string): Promise<string> {
  const board = await api('/api/board');
  const col = board.columns.find(
    (c: any) => c.id === nameOrId || c.name.toLowerCase() === nameOrId.toLowerCase()
  );
  if (!col) throw new Error(`Column "${nameOrId}" not found`);
  return col.id;
}

const server = new McpServer({
  name: 'copilot-cli-board',
  version: '0.1.0',
});

// ── kanban.get_board ──
server.tool('kanban_get_board', 'Get the full board (columns, cards, labels)', {}, async () => {
  log('INFO', 'kanban_get_board', 'fetching board');
  const board = await api('/api/board');
  log('INFO', 'kanban_get_board', `returned ${board.cards?.length ?? 0} cards, ${board.columns?.length ?? 0} columns`);
  return { content: [{ type: 'text', text: JSON.stringify(board, null, 2) }] };
});

// ── kanban.create_card ──
server.tool(
  'kanban_create_card',
  'Create a new card on the board',
  {
    title: z.string().describe('Verb-first task title'),
    description: z.string().optional().describe('Task description'),
    column: z.string().optional().describe('Column name or ID (default: Backlog)'),
    labels: z.array(z.string()).optional().describe('Label names'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api", "agent-ui"). Required for identity tracking'),
  },
  async ({ title, description, column, labels, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_create_card', 'creating card', { title, column, labels, actor: resolvedActor });
    const columnId = await resolveColumn(column ?? 'Backlog');
    const card = await api('/api/cards', 'POST', {
      title,
      description: description ?? '',
      columnId,
      labels: labels ?? [],
      actor: resolvedActor,
    });
    await recordToolUsage(card.id, 'kanban_create_card', resolvedActor);
    log('INFO', 'kanban_create_card', `created card ${card.id}`, { title, column: column ?? 'Backlog' });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ cardId: card.id, url: `${BASE_URL}/card/${card.id}` }),
        },
      ],
    };
  }
);

// ── kanban.move_card ──
server.tool(
  'kanban_move_card',
  'Move a card to a different column',
  {
    cardId: z.string().describe('Card ID'),
    column: z.string().describe('Target column name or ID'),
    note: z.string().optional().describe('Note about the move'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api", "agent-ui"). Required for identity tracking'),
  },
  async ({ cardId, column, note, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_move_card', `moving card ${cardId} → ${column}`, { actor: resolvedActor, note });
    const columnId = await resolveColumn(column);
    const result = await api(`/api/cards/${cardId}`, 'PATCH', {
      columnId,
      actor: resolvedActor,
    });
    if (note) {
      await api('/api/events', 'POST', {
        cardId,
        type: 'note',
        actor: resolvedActor,
        payload: { note },
      });
    }
    await recordToolUsage(cardId, 'kanban_move_card', resolvedActor);
    log('INFO', 'kanban_move_card', `moved card ${cardId} → ${column}, sleeping 2s for animation`);
    await sleep(2000);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.update_card ──
server.tool(
  'kanban_update_card',
  'Update card title or description',
  {
    cardId: z.string().describe('Card ID'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api", "agent-ui"). Required for identity tracking'),
  },
  async ({ cardId, title, description, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_update_card', `updating card ${cardId}`, { title, actor: resolvedActor });
    const body: any = { actor: resolvedActor };
    if (title) body.title = title;
    if (description !== undefined) body.description = description;
    const result = await api(`/api/cards/${cardId}`, 'PATCH', body);
    await recordToolUsage(cardId, 'kanban_update_card', resolvedActor);
    log('INFO', 'kanban_update_card', `updated card ${cardId}`);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.set_labels ──
server.tool(
  'kanban_set_labels',
  'Set the exact label set on a card',
  {
    cardId: z.string().describe('Card ID'),
    labels: z.array(z.string()).describe('Label names'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, labels, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_set_labels', `setting labels on card ${cardId}`, { labels, actor: resolvedActor });
    const result = await api(`/api/cards/${cardId}/labels`, 'POST', {
      labels,
      actor: resolvedActor,
    });
    await recordToolUsage(cardId, 'kanban_set_labels', resolvedActor);
    log('INFO', 'kanban_set_labels', `labels set on card ${cardId}`, { labels });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.append_event ──
server.tool(
  'kanban_append_event',
  'Append an event to a card',
  {
    cardId: z.string().describe('Card ID'),
    type: z.string().describe('Event type'),
    payload: z.record(z.unknown()).optional().describe('Event payload'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, type, payload, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_append_event', `appending event to card ${cardId}`, { type, actor: resolvedActor });
    const result = await api('/api/events', 'POST', {
      cardId,
      type,
      actor: resolvedActor,
      payload: payload ?? {},
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.archive_card ──
server.tool(
  'kanban_archive_card',
  'Archive a card (soft delete)',
  {
    cardId: z.string().describe('Card ID'),
    reason: z.string().describe('Reason for archiving'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, reason, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_archive_card', `archiving card ${cardId}`, { reason, actor: resolvedActor });
    const result = await api(`/api/cards/${cardId}/archive`, 'POST', {
      reason,
      actor: resolvedActor,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.unarchive_card ──
server.tool(
  'kanban_unarchive_card',
  'Unarchive a card',
  {
    cardId: z.string().describe('Card ID'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_unarchive_card', `unarchiving card ${cardId}`, { actor: resolvedActor });
    const result = await api(`/api/cards/${cardId}/unarchive`, 'POST', {
      actor: resolvedActor,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.record_skill_use ──
server.tool(
  'kanban_record_skill_use',
  'Record a skill used while working on a card',
  {
    cardId: z.string().describe('Card ID'),
    skill: z.string().describe('Skill name'),
    version: z.string().optional().describe('Skill version'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, skill, version, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    const skillEntry = version ? `${skill}@${version}` : skill;
    log('INFO', 'kanban_record_skill_use', `recording skill "${skillEntry}" on card ${cardId}`, { actor: resolvedActor });
    const result = await api(`/api/cards/${cardId}/provenance`, 'POST', {
      addSkills: [skillEntry],
      actor: resolvedActor,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.record_instruction_use ──
server.tool(
  'kanban_record_instruction_use',
  'Record an instruction followed while working on a card',
  {
    cardId: z.string().describe('Card ID'),
    instruction: z.string().describe('Instruction name'),
    path: z.string().optional().describe('Instruction file path'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, instruction, path, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    const entry = path ? `${instruction} (${path})` : instruction;
    log('INFO', 'kanban_record_instruction_use', `recording instruction "${entry}" on card ${cardId}`, { actor: resolvedActor });
    const result = await api(`/api/cards/${cardId}/provenance`, 'POST', {
      addInstructions: [entry],
      actor: resolvedActor,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── kanban.record_tool_use ──
server.tool(
  'kanban_record_tool_use',
  'Record a tool used while working on a card',
  {
    cardId: z.string().describe('Card ID'),
    tool: z.string().describe('Tool name'),
    actor: z.string().describe('Your agent/sub-agent name (e.g. "agent-api")'),
  },
  async ({ cardId, tool, actor }) => {
    const resolvedActor = actor ?? 'mcp-agent';
    log('INFO', 'kanban_record_tool_use', `recording tool "${tool}" on card ${cardId}`, { actor: resolvedActor });
    const result = await api(`/api/cards/${cardId}/provenance`, 'POST', {
      addTools: [tool],
      actor: resolvedActor,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// ── Start ──
log('INFO', 'startup', `MCP server starting, API: ${BASE_URL}`);
const transport = new StdioServerTransport();
await server.connect(transport);
