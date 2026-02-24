import type { Board, Card, BoardEvent, Label, Provenance } from '@copilot-cli-board/shared';

const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getBoard(includeArchived = false): Promise<Board> {
  return request(`/board${includeArchived ? '?includeArchived=true' : ''}`);
}

export async function createCard(data: {
  title: string;
  description?: string;
  columnId: string;
  labels?: string[];
}): Promise<Card> {
  return request('/cards', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCard(
  id: string,
  data: Partial<{ title: string; description: string; columnId: string; order: number }>
): Promise<Card> {
  return request(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function setCardLabels(id: string, labels: string[]): Promise<Card> {
  return request(`/cards/${id}/labels`, { method: 'POST', body: JSON.stringify({ labels }) });
}

export async function getEvents(cardId: string): Promise<BoardEvent[]> {
  return request(`/events?cardId=${cardId}`);
}

export async function archiveCard(id: string, reason: string): Promise<Card> {
  return request(`/cards/${id}/archive`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function unarchiveCard(id: string): Promise<Card> {
  return request(`/cards/${id}/unarchive`, { method: 'POST', body: JSON.stringify({}) });
}

export async function getProvenance(id: string): Promise<Provenance> {
  return request(`/cards/${id}/provenance`);
}

export async function createLabel(name: string, color?: string): Promise<Label> {
  return request('/labels', { method: 'POST', body: JSON.stringify({ name, color }) });
}
