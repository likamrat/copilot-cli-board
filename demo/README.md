# Demo

This folder contains everything you need to run and reset the GitHub Copilot CLI Board demo.

## Prerequisites

1. Server running on :4800 and UI running on :5173
2. Clean board (run `bash demo/revert.sh` first)
3. MCP server configured (see root README for setup)
4. A separate terminal for running the demo prompt

## How to run the demo

1. Open the board UI at http://127.0.0.1:5173 in your browser
2. Open a separate terminal in the project directory
3. Start a Copilot CLI session
4. Paste the prompt below and watch the board update in real time

### Demo prompt

```
I'd like two new features for the board:

1. An activity timeline -- a collapsible sidebar on the right side of the board that shows a live feed of all board events (card created, card moved to column, labels changed, etc). Each entry should show a timestamp, the actor name, and what happened. It should update in realtime as events come in and auto-scroll to the latest entry.

2. A card search bar -- a text input below the header that filters cards by title as you type. Columns with no matches should appear dimmed.

These are independent features -- create a separate card for each one and work on them in parallel.
```

## What to expect

- The agent reads `.github/copilot-instructions.md` and starts using the board automatically
- Cards appear in the Backlog column, then move through Planned, In Progress, Review, and Done
- The flying card animation shows each transition visually
- The agent creates separate cards for each feature and tracks its progress on each one
- Each card gets labels, events, and provenance metadata

## Reverting the demo

Run this from the project root to undo all demo changes and reset the board:

```bash
bash demo/revert.sh
```

This restores source files from backups, removes demo-created components, wipes the board database, and restarts the server and UI.

## Recovery

If the server or UI goes down during a demo, paste this into a fresh Copilot CLI session:

```
I'm working on the GitHub Copilot CLI Board project at /home/lior/repos/copilot-cli-board.
It's a pnpm monorepo with:
- apps/server (Express + SQLite on :4800)
- apps/ui (React + Fluent UI + Vite on :5173)
- apps/mcp (MCP server exposing kanban_* tools)
- apps/sim (simulator)
- packages/shared (shared types)

Please check if the server (:4800) and UI (:5173) are running. If not, start them:
- Server: npx pnpm --filter @copilot-cli-board/server dev (detached)
- UI: npx pnpm --filter @copilot-cli-board/ui dev (detached)

Verify both respond (curl), then confirm the board is ready.
```

## Troubleshooting

- **UI shows "Reloading board..." then stops**: The agent may have introduced a temporary error. Wait for the agent to finish, then refresh. If it persists, run `bash demo/revert.sh`
- **UI shows blank page after demo**: Run `bash demo/revert.sh` to restore clean source files
- **Cards still on board after revert**: The revert script force-stops all processes on :4800 and waits for the port to be free before restarting
- **"Readonly database" error**: The server must be started via `pnpm dev` or `pnpm --filter @copilot-cli-board/server dev`, not by running tsx directly from the apps/server directory
- **MCP logs**: Check `.copilot-cli-board/mcp.log` for tool call history and errors
