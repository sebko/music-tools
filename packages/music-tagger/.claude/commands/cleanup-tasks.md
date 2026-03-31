---
description: Kill all crashed/duplicate backend and frontend servers
---

# cleanup-tasks

Cleanup all background server tasks and restart fresh development servers.

This is useful when you have accumulated many crashed/duplicate server processes from rapid file changes or port conflicts.

## Examples
- `/cleanup-tasks` - Kill all server processes and restart fresh

## Description

This command performs aggressive cleanup of all development server processes:
- Kills ALL processes on ports 3001 (backend) and 5173 (frontend)
- Kills ALL nodemon instances
- Kills ALL npm dev processes
- Restarts clean servers using /start-dev

## Implementation

When executed, Claude will perform the following steps:

### Step 1: Kill processes by port
```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null || echo "✓ No processes on port 3001"
lsof -ti:5173 | xargs kill -9 2>/dev/null || echo "✓ No processes on port 5173"
```

### Step 2: Kill zombie nodemon processes
```bash
pkill -9 -f "nodemon.*server.js" 2>/dev/null || echo "✓ No nodemon processes"
pkill -9 -f "nodemon.*vite" 2>/dev/null || echo "✓ No vite processes"
```

### Step 3: Kill any remaining npm dev processes
```bash
pkill -9 -f "npm run dev" 2>/dev/null || echo "✓ No npm dev processes"
```

### Step 4: Wait for cleanup
```bash
sleep 2
```

### Step 5: Restart servers
```bash
/start-dev
```

## When to Use

Use this command when:
- You see many duplicate background tasks (check with `bashes` command)
- Servers are crashing with "port already in use" errors
- Nodemon is stuck in a restart loop
- You want to ensure a completely clean server state

## Usage Notes

- This command is aggressive - it will kill ALL server processes
- After running, fresh servers will be started automatically
- All Claude Code background tasks for old servers will be cleaned up
