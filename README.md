# Agentic Bridge

A full-stack AI-powered productivity hub with a glassy black UI. It parses natural language into actionable intents, manages tasks and schedules, syncs with Google services, and updates everything in real-time via Socket.IO.

## Quick start

1. Docker up the database:

```bash
docker compose up -d
```

2. Install deps and run dev:

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4000
- Adminer (optional): http://localhost:8080 (System: PostgreSQL, Server: db, User: postgres, Password: postgres, DB: agentic_bridge)

## Env

- server/.env (see server/.env.example)

## Features

- **Smart Assistant**: Natural language commands powered by Cohere AI. Create tasks, set reminders, or manage schedules via text or voice.
- **Task & Agent Workspace**: Two-column layout with a task command board and live agent chat. All updates sync instantly via Socket.IO.
- **Schedule Parser**: Upload schedule images; the AI extracts activities, times, and locations, then creates tasks/reminders.
- **Google Integration**: Connect Google Calendar/Tasks to sync reminders and events automatically.
- **Glassy Black Theme**: Modern glassmorphism UI with smooth animations and responsive design.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express.js + Socket.IO + PostgreSQL
- **AI**: Cohere for intent parsing and schedule OCR
- **Realtime**: Socket.IO for live task/chat updates
- **Persistence**: PostgreSQL with vector embeddings for context

## Notes

- All agent outputs are structured JSON; UI renders confirmations and prompts.
- Voice input and TTS for hands-free interaction.
- Session-based context for multi-turn conversations.
- Responsive design works on desktop and mobile.
