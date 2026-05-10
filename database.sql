-- ============================================================
-- AUX BATTLES — Supabase Database Setup
-- Run this entire file in: Supabase → SQL Editor → New query
-- ============================================================

-- 1. ROOMS — one row per active game room
CREATE TABLE IF NOT EXISTS rooms (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT    UNIQUE NOT NULL,           -- 6-char join code
  host_player_id  UUID,                              -- updated after host player is created
  status          TEXT    DEFAULT 'lobby',           -- lobby | submitting | voting | results | ended
  current_theme   TEXT,                              -- theme text for the active round
  current_round   INTEGER DEFAULT 0,                 -- 0 = not started
  max_score       INTEGER DEFAULT 5,                 -- first to reach this wins
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PLAYERS — one row per person in a room
CREATE TABLE IF NOT EXISTS players (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id     UUID    REFERENCES rooms(id) ON DELETE CASCADE,
  nickname    TEXT    NOT NULL,
  score       INTEGER DEFAULT 0,
  is_host     BOOLEAN DEFAULT FALSE,
  is_active   BOOLEAN DEFAULT TRUE,   -- set to false when a player leaves
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SUBMISSIONS — one song per player per round
CREATE TABLE IF NOT EXISTS submissions (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id     UUID    REFERENCES rooms(id) ON DELETE CASCADE,
  player_id   UUID    REFERENCES players(id) ON DELETE CASCADE,
  round       INTEGER NOT NULL,
  song_title  TEXT    NOT NULL,
  artist      TEXT    NOT NULL,
  link        TEXT,                   -- optional YouTube / Spotify URL
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, round)            -- one song per player per round
);

-- 4. VOTES — one vote per player per round
CREATE TABLE IF NOT EXISTS votes (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id         UUID    REFERENCES rooms(id) ON DELETE CASCADE,
  voter_id        UUID    REFERENCES players(id) ON DELETE CASCADE,
  submission_id   UUID    REFERENCES submissions(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(voter_id, round, room_id)    -- one vote per player per round
);

-- ── Disable Row Level Security (simplest for a demo/party game)
-- For a production app you would add proper RLS policies instead.
ALTER TABLE rooms       DISABLE ROW LEVEL SECURITY;
ALTER TABLE players     DISABLE ROW LEVEL SECURITY;
ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE votes       DISABLE ROW LEVEL SECURITY;

-- ── Enable Realtime for all four tables
-- This allows the app to receive live updates via Supabase Realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
