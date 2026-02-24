# Contributing to GitHub Copilot CLI Board

Contributions are welcome. To get started:

1. Fork the repo and clone locally
2. Run `pnpm install` to install dependencies
3. Run `pnpm dev` to start the server and UI
4. Make your changes and test them against the running board
5. Submit a pull request with a clear description of what changed and why

## Guidelines

- Keep PRs focused on a single change
- If you are adding a new MCP tool, include the corresponding REST endpoint and update the tools table in README.md
- Use TypeScript for all new code
- Test your changes against the running board before submitting
- Archive cards instead of deleting them (no hard delete in the API)

## Development setup

```bash
# Install dependencies
pnpm install

# Start the board server and UI in dev mode
pnpm dev
```

- Board UI: http://127.0.0.1:5173
- Board API: http://127.0.0.1:4800

## Project structure

```
apps/
  server/    Express + SQLite board service (REST + SSE)
  ui/        React + Fluent UI web frontend
  mcp/       MCP server (stdio) exposing kanban_* tools
  sim/       Simulator CLI for testing scenarios
packages/
  shared/    Shared TypeScript types
```
