CREATE TABLE revoked_session_tokens (
  token_id TEXT PRIMARY KEY NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_revoked_session_tokens_expiry ON revoked_session_tokens (expires_at);
