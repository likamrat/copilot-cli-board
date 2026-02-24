# Copilot CLI Board — Agent Instructions

You have access to a local Kanban board via `kanban_*` MCP tools. **Always use it to track your work.**

## Workflow

1. **Plan first**: `kanban_create_card` in **Backlog**, then immediately `kanban_move_card` to **Planned** once you know what you'll do
2. **When you begin coding**: `kanban_move_card` to **In Progress**
3. **When code is ready**: `kanban_move_card` to **Review** and `kanban_append_event` with a summary of what files changed and how
4. **Verify your work**: run `tsc --noEmit`, test the feature, confirm it works. Then `kanban_move_card` to **Done** with a final summary event
5. **If blocked**: `kanban_move_card` to **Blocked** with a note explaining why

## Card ownership

- **Only create a card if YOU are implementing the work.** If you are orchestrating sub-agents, let each sub-agent create its own card. Do not create cards that you will not personally work on.
- Before creating a card, call `kanban_get_board` to check if a card for this task already exists. If it does, use that card instead of creating a duplicate.
- One card per atomic task — split when work involves independent areas (e.g., API endpoint vs UI component).

## Rules

- Set `actor` to your agent name on every tool call
- Use `kanban_set_labels` to categorize (e.g., frontend, backend, api, bugfix)
- Use `kanban_record_skill_use` / `kanban_record_instruction_use` to log provenance

## Required — do not skip

- **Never skip columns.** Every card must pass through: Backlog → Planned → In Progress → Review → Done (or Blocked).
- **Always append events** when moving to Review and Done. The event payload should describe what was accomplished.
- **Always record provenance** after completing work: call `kanban_record_skill_use` for skills and `kanban_record_instruction_use` for instructions you followed.
- **Review means verify.** Do not move to Review until you have tested or built the code. Do not move to Done until you have confirmed the feature actually works.
