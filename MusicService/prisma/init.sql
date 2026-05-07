-- MusicService tables — run this in your Neon SQL editor to create tables without touching existing ones.

CREATE TABLE IF NOT EXISTS songs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  duration     INT NOT NULL DEFAULT 0,
  audio_url    TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  artists      TEXT[] NOT NULL DEFAULT '{}',
  lyrics       TEXT NOT NULL DEFAULT '',
  public_date  TIMESTAMPTZ NOT NULL,
  is_public    BOOLEAN NOT NULL DEFAULT TRUE,
  status       TEXT NOT NULL DEFAULT 'active',
  play_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  song_id      UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playlists_user_id_idx ON playlists(user_id);

CREATE TABLE IF NOT EXISTS playlist_songs (
  id          SERIAL PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id     UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  UNIQUE (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS likes (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  song_id    UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, song_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id    UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_song_id_idx ON comments(song_id);

-- Trigger to auto-update updated_at on songs, playlists, comments
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'songs_updated_at') THEN
    CREATE TRIGGER songs_updated_at BEFORE UPDATE ON songs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'playlists_updated_at') THEN
    CREATE TRIGGER playlists_updated_at BEFORE UPDATE ON playlists
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'comments_updated_at') THEN
    CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;
