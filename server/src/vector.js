import { pipeline } from '@xenova/transformers';
import { query } from './db.js';

let extractorPromise;
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        if (process.env.HF_HUB_OFFLINE === 'true' || process.env.TRANSFORMERS_OFFLINE === '1') {
          return null;
        }
        return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (e) {
        return null; // offline fallback
      }
    })();
  }
  return extractorPromise;
}

// Offline hashing-based embedding (384 dims) as deterministic fallback
function embedTextFallback(text, dim = 384) {
  const vec = new Float32Array(dim);
  const tokens = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    // simple 32-bit hash
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    const idx = h % dim;
    vec[idx] += 1;
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] = vec[i] / norm;
  return Array.from(vec);
}

export async function embedText(text) {
  const extractor = await getExtractor();
  if (!extractor) {
    return embedTextFallback(text);
  }
  try {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const arr = Array.from(output.data);
    return arr;
  } catch {
    return embedTextFallback(text);
  }
}

export async function upsertEmbedding(entity_type, entity_id, text, metadata = {}) {
  const vec = await embedText(text);
  const vectorStr = '[' + vec.join(',') + ']';
  await query(
    `INSERT INTO embeddings (entity_type, entity_id, embedding, metadata)
     VALUES ($1, $2, $3::vector, $4)
     ON CONFLICT (entity_type, entity_id)
     DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata`,
    [entity_type, entity_id, vectorStr, metadata]
  );
}

export async function deleteEmbedding(entity_type, entity_id) {
  await query('DELETE FROM embeddings WHERE entity_type = $1 AND entity_id = $2', [entity_type, entity_id]);
}

export async function searchByVector(queryText, limit = 5) {
  const vec = await embedText(queryText);
  const vectorStr = '[' + vec.join(',') + ']';
  const res = await query(
    `SELECT entity_type, entity_id, metadata, 1 - (embedding <=> $1::vector) AS score
     FROM embeddings
     ORDER BY embedding <=> $1::vector
     LIMIT $2`, [vectorStr, limit]
  );
  return res.rows;
}
