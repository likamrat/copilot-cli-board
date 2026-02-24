#!/usr/bin/env bash
# Revert the dogfood demo
set -e
cd "$(dirname "$0")/.."

echo "Reverting dogfood demo..."

# Restore backed-up files
for f in apps/ui/src/App.tsx apps/server/src/routes.ts apps/ui/src/api.ts apps/ui/src/components/KanbanBoard.tsx apps/ui/index.html apps/ui/src/useSSE.ts apps/ui/src/main.tsx apps/server/src/db.ts apps/server/src/index.ts; do
  if [ -f "$f.bak" ]; then
    cp "$f.bak" "$f"
    echo "  ✅ Restored $(basename $f)"
  else
    echo "  ⚠️  No $(basename $f) backup found"
  fi
done

# Remove any demo-created component files
for f in apps/ui/src/components/BoardStats.tsx \
         apps/ui/src/components/StatsFooter.tsx \
         apps/ui/src/components/SearchFilter.tsx \
         apps/ui/src/components/SearchFilterBar.tsx \
         apps/ui/src/components/CardFilter.tsx \
         apps/ui/src/components/FilterBar.tsx \
         apps/ui/src/components/ToastNotifications.tsx \
         apps/ui/src/components/BoardToast.tsx \
         apps/ui/src/components/ActivityTimeline.tsx \
         apps/ui/src/components/ActivitySidebar.tsx \
         apps/ui/src/components/EventTimeline.tsx \
         apps/ui/src/components/ActivityFeed.tsx \
         apps/ui/src/components/SearchBar.tsx; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "  ✅ Removed $(basename $f)"
  fi
done

# Clean the board data
echo ""
echo "Cleaning board data..."

SERVER_PIDS=$(lsof -ti:4800 2>/dev/null || true)
if [ -n "$SERVER_PIDS" ]; then
  for pid in $SERVER_PIDS; do
    kill $pid 2>/dev/null || true
  done
  sleep 1
  echo "  ✅ Stopped server"
fi

rm -f .copilot-cli-board/board.db
rm -f .copilot-cli-board/mcp.log
echo "  ✅ Removed board database and logs"

# Restart server
nohup npx pnpm --filter @copilot-cli-board/server dev > /dev/null 2>&1 &
sleep 3

# Verify server is up
if curl -sf http://127.0.0.1:4800/api/board > /dev/null 2>&1; then
  echo "  ✅ Server restarted with clean database"
else
  echo "  ❌ Server failed to start. Check manually."
  exit 1
fi

# Verify UI is up
if curl -sf http://127.0.0.1:5173/ > /dev/null 2>&1; then
  echo "  ✅ UI is running"
else
  echo "  ⚠️  UI not running. Starting..."
  nohup npx pnpm --filter @copilot-cli-board/ui dev > /dev/null 2>&1 &
  sleep 3
  if curl -sf http://127.0.0.1:5173/ > /dev/null 2>&1; then
    echo "  ✅ UI started"
  else
    echo "  ❌ UI failed to start. Check manually."
    exit 1
  fi
fi

echo ""
echo "✅ Revert complete. Refresh the browser."
