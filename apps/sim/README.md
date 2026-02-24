# Simulator

A CLI tool that calls the board REST API directly to simulate agent workflows. Useful for testing the board, filling it with sample data, or verifying API behavior after changes.

This does not use the MCP server or Copilot CLI. It talks to the board API with plain HTTP requests.

## Prerequisites

Server must be running on :4800.

## Usage

From the project root:

```bash
# Run the happy path scenario (create card, move through columns, done)
pnpm sim:happy-path

# Run the blocked scenario (card gets stuck, then unblocked)
pnpm sim:blocked

# Run the multi-agent scenario (multiple agents working in parallel)
pnpm sim:multi-agent

# Run with assertions (verify expected board state after the scenario)
pnpm sim:happy-path:assert
pnpm sim:blocked:assert
pnpm sim:multi-agent:assert
```

## Scenarios

**happy-path**: Creates a card in Planned, records provenance, moves through In Progress, Review, and Done with events at each step.

**blocked**: Creates a card, moves it to In Progress, then to Blocked with a blocker event. Unblocks and moves to Done.

**multi-agent**: Multiple simulated agents create and work on cards concurrently, showing how the board handles parallel updates.
