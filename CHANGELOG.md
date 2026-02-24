# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-02-24

### Added

- Kanban board with six default columns (Backlog, Planned, In Progress, Review, Blocked, Done)
- REST API with SSE for real-time updates
- MCP server exposing 11 `kanban_*` tools for agent-driven board updates
- React + Fluent UI web frontend with drag-and-drop
- Card labels, event log, and provenance tracking
- Archive and unarchive support
- Simulator CLI with three scenarios (happy-path, blocked, multi-agent)
- Localhost-only binding with optional bearer token auth
- Agent instructions file for automatic board usage by Copilot CLI
