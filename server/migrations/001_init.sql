-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Core tables
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  status text DEFAULT 'todo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Embeddings store
CREATE TABLE IF NOT EXISTS embeddings (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  embedding vector(384) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_cosine ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
