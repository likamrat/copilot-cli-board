const BASE_URL = process.env.COPILOT_CLI_BOARD_URL ?? 'http://127.0.0.1:4800';
const TOKEN = process.env.COPILOT_CLI_BOARD_TOKEN;

async function api(path: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Scenarios ──

async function happyPath() {
  console.log('🎬 Scenario: happy-path');

  // 1. Create card in Planned with labels
  const board = await api('/api/board');
  const planned = board.columns.find((c: any) => c.name === 'Planned');
  const card = await api('/api/cards', 'POST', {
    title: 'Implement user authentication',
    description: 'Add JWT-based auth to the API',
    columnId: planned.id,
    labels: ['backend', 'security'],
    actor: 'sim-agent',
  });
  console.log(`  ✅ Created card: ${card.id} in Planned`);
  await sleep(500);

  // 2. Record skill + instruction
  await api(`/api/cards/${card.id}/provenance`, 'POST', {
    addSkills: ['code-editing'],
    addInstructions: ['jwt-best-practices'],
    actor: 'sim-agent',
  });
  console.log('  ✅ Recorded provenance (skill + instruction)');
  await sleep(500);

  // 3. Move to In Progress
  const inProgress = board.columns.find((c: any) => c.name === 'In Progress');
  await api(`/api/cards/${card.id}`, 'PATCH', {
    columnId: inProgress.id,
    actor: 'sim-agent',
  });
  console.log('  ✅ Moved to In Progress');
  await sleep(500);

  // 4. Append "tests run" event
  await api('/api/events', 'POST', {
    cardId: card.id,
    type: 'tests-passed',
    actor: 'sim-agent',
    payload: { suite: 'auth', passed: 12, failed: 0 },
  });
  console.log('  ✅ Appended tests-passed event');
  await sleep(500);

  // 5. Move to Review
  const review = board.columns.find((c: any) => c.name === 'Review');
  await api(`/api/cards/${card.id}`, 'PATCH', {
    columnId: review.id,
    actor: 'sim-agent',
  });
  console.log('  ✅ Moved to Review');
  await sleep(500);

  // 6. Move to Done with final summary
  const done = board.columns.find((c: any) => c.name === 'Done');
  await api(`/api/cards/${card.id}`, 'PATCH', {
    columnId: done.id,
    actor: 'sim-agent',
  });
  await api('/api/events', 'POST', {
    cardId: card.id,
    type: 'summary',
    actor: 'sim-agent',
    payload: { summary: 'Implemented JWT auth with bcrypt hashing. All 12 tests pass.' },
  });
  console.log('  ✅ Moved to Done + final summary');

  return card.id;
}

async function blocked() {
  console.log('🎬 Scenario: blocked');

  const board = await api('/api/board');
  const backlog = board.columns.find((c: any) => c.name === 'Backlog');
  const card = await api('/api/cards', 'POST', {
    title: 'Integrate payment gateway',
    description: 'Connect to Stripe for payment processing',
    columnId: backlog.id,
    labels: ['integration'],
    actor: 'sim-agent',
  });
  console.log(`  ✅ Created card: ${card.id} in Backlog`);
  await sleep(500);

  // Move to In Progress
  const inProgress = board.columns.find((c: any) => c.name === 'In Progress');
  await api(`/api/cards/${card.id}`, 'PATCH', {
    columnId: inProgress.id,
    actor: 'sim-agent',
  });
  console.log('  ✅ Moved to In Progress');
  await sleep(500);

  // Block with reason
  const blockedCol = board.columns.find((c: any) => c.name === 'Blocked');
  await api(`/api/cards/${card.id}`, 'PATCH', {
    columnId: blockedCol.id,
    actor: 'sim-agent',
  });
  await api('/api/events', 'POST', {
    cardId: card.id,
    type: 'blocker',
    actor: 'sim-agent',
    payload: { reason: 'Waiting for Stripe API keys from team lead' },
  });
  console.log('  ✅ Moved to Blocked + blocker event');

  return card.id;
}

async function multiAgent() {
  console.log('🎬 Scenario: multi-agent');

  const board = await api('/api/board');
  const planned = board.columns.find((c: any) => c.name === 'Planned');

  // Main agent creates card
  const card = await api('/api/cards', 'POST', {
    title: 'Refactor database schema',
    description: 'Normalize tables and add indexes',
    columnId: planned.id,
    labels: ['database', 'refactor'],
    actor: 'main-agent',
  });
  console.log(`  ✅ Main agent created card: ${card.id}`);
  await sleep(500);

  // Sub-agent records provenance + moves card
  await api(`/api/cards/${card.id}/provenance`, 'POST', {
    addSkills: ['sql-optimization', 'schema-design'],
    addInstructions: ['normalization-rules'],
    addTools: ['better-sqlite3'],
    addAgents: ['main-agent', 'sub-agent-db'],
    actor: 'sub-agent-db',
  });
  console.log('  ✅ Sub-agent recorded provenance');
  await sleep(500);

  const inProgress = board.columns.find((c: any) => c.name === 'In Progress');
  await api(`/api/cards/${card.id}`, 'PATCH', {
    columnId: inProgress.id,
    actor: 'sub-agent-db',
  });
  console.log('  ✅ Sub-agent moved to In Progress');

  return card.id;
}

// ── Assert mode ──

async function assertScenario(scenario: string, cardId: string) {
  console.log('\n🔍 Assert mode: verifying...');
  const board = await api('/api/board');
  const card = board.cards.find((c: any) => c.id === cardId);

  if (!card) {
    console.error('  ❌ Card not found on board');
    process.exit(1);
  }

  const events = await api(`/api/events?cardId=${cardId}`);
  let errors = 0;

  function check(label: string, ok: boolean) {
    if (ok) {
      console.log(`  ✅ ${label}`);
    } else {
      console.error(`  ❌ ${label}`);
      errors++;
    }
  }

  if (scenario === 'happy-path') {
    const doneCol = board.columns.find((c: any) => c.name === 'Done');
    check('Card is in Done', card.columnId === doneCol.id);
    check('Has label "backend"', card.labels.some((l: any) => l.name === 'backend'));
    check('Has label "security"', card.labels.some((l: any) => l.name === 'security'));
    check('Provenance has skill "code-editing"', card.provenance.skillsUsed.includes('code-editing'));
    check('Provenance has instruction "jwt-best-practices"', card.provenance.instructionsUsed.includes('jwt-best-practices'));
    check('Has tests-passed event', events.some((e: any) => e.type === 'tests-passed'));
    check('Has summary event', events.some((e: any) => e.type === 'summary'));
  } else if (scenario === 'blocked') {
    const blockedCol = board.columns.find((c: any) => c.name === 'Blocked');
    check('Card is in Blocked', card.columnId === blockedCol.id);
    check('Has label "integration"', card.labels.some((l: any) => l.name === 'integration'));
    check('Has blocker event', events.some((e: any) => e.type === 'blocker'));
  } else if (scenario === 'multi-agent') {
    const inProgressCol = board.columns.find((c: any) => c.name === 'In Progress');
    check('Card is in In Progress', card.columnId === inProgressCol.id);
    check('Has label "database"', card.labels.some((l: any) => l.name === 'database'));
    check('Provenance has skill "sql-optimization"', card.provenance.skillsUsed.includes('sql-optimization'));
    check('Provenance has instruction "normalization-rules"', card.provenance.instructionsUsed.includes('normalization-rules'));
    check('Provenance has tool "better-sqlite3"', card.provenance.toolsUsed.includes('better-sqlite3'));
    check('Provenance has agent "sub-agent-db"', card.provenance.agentsInvolved.includes('sub-agent-db'));
  }

  if (errors > 0) {
    console.error(`\n💥 ${errors} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\n🎉 All assertions passed!');
}

// ── CLI ──

const args = process.argv.slice(2);
const scenario = args.find((a) => !a.startsWith('-'));
const assertMode = args.includes('--assert');

if (!scenario || !['happy-path', 'blocked', 'multi-agent'].includes(scenario)) {
  console.error('Usage: pnpm sim <happy-path|blocked|multi-agent> [--assert]');
  process.exit(1);
}

const runners: Record<string, () => Promise<string>> = {
  'happy-path': happyPath,
  blocked,
  'multi-agent': multiAgent,
};

try {
  const cardId = await runners[scenario]();
  if (assertMode) {
    await assertScenario(scenario, cardId);
  } else {
    console.log('\n✨ Scenario complete. Run with --assert to verify.');
  }
} catch (err) {
  console.error('💥 Scenario failed:', err);
  process.exit(1);
}
