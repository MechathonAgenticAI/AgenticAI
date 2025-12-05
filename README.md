# Agentic Bridge (React + Express + Postgres + pgvector)

A full-stack agent that parses natural language into JSON intents, performs safe CRUD actions against Postgres, stores vector memory with pgvector, and updates the UI in realtime via Socket.IO. Includes voice input and TTS.

## Quick start

1. Docker up the database:

```bash
docker compose up -d
```

2. Install deps and run dev:

```bash
npm install
npm run migrate
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4000
- Adminer (optional): http://localhost:8080 (System: PostgreSQL, Server: db, User: postgres, Password: postgres, DB: agentic_bridge)

## Env

- server/.env (see server/.env.example)

## Notes

- Intent parsing uses local zero-shot models via `@xenova/transformers` (free). Embeddings use `all-MiniLM-L6-v2`.
- All agent outputs are JSON; UI renders structured prompts and confirmations.
- Realtime updates via Socket.IO push changes to the task board and notes without page reload.
