-- CommandLog table for logging raw commands with embeddings
CREATE TABLE IF NOT EXISTS command_log (
  id uuid PRIMARY KEY,
  session_id uuid,
  raw_command text NOT NULL,
  embedding vector(384) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Optional index to speed up timeline lookups
CREATE INDEX IF NOT EXISTS idx_command_log_session_created_at ON command_log(session_id, created_at DESC);

-- ANN index for vector similarity (IVFFLAT) requires populated table; can be created now
CREATE INDEX IF NOT EXISTS idx_command_log_embedding_ivfflat
  ON command_log USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
