// ── Column ──
export interface Column {
  id: string;
  name: string;
  order: number;
}

// ── Label ──
export interface Label {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

// ── Provenance ──
export interface Provenance {
  skillsUsed: string[];
  instructionsUsed: string[];
  toolsUsed: string[];
  agentsInvolved: string[];
}

// ── Card ──
export interface Card {
  id: string;
  title: string;
  description: string;
  columnId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  provenance: Provenance;
  lastUpdatedBy: string | null;
  labels: Label[];
}

// ── Event ──
export interface BoardEvent {
  id: string;
  type: string;
  cardId: string;
  timestamp: string;
  actor: string;
  payload: Record<string, unknown>;
}

// ── Board (full snapshot) ──
export interface Board {
  columns: Column[];
  cards: Card[];
  labels: Label[];
}

// ── Column stats ──
export interface ColumnStats {
  columnId: string;
  columnName: string;
  count: number;
}

// ── SSE event types ──
export type SSEEventType =
  | 'card:created'
  | 'card:updated'
  | 'card:moved'
  | 'card:archived'
  | 'card:unarchived'
  | 'card:labels'
  | 'card:provenance'
  | 'label:created'
  | 'label:updated'
  | 'event:created'
  | 'stats:updated';

export interface SSEMessage {
  type: SSEEventType;
  data: unknown;
}

// ── Default columns ──
export const DEFAULT_COLUMNS: Omit<Column, 'id'>[] = [
  { name: 'Backlog', order: 0 },
  { name: 'Planned', order: 1 },
  { name: 'In Progress', order: 2 },
  { name: 'Review', order: 3 },
  { name: 'Blocked', order: 4 },
  { name: 'Done', order: 5 },
];
