-- migrations/001_initial.sql
-- Database schema for Tic-Tac-Toe game
-- This creates tables for storing game data

-- ============================================================
-- PLAYERS TABLE
-- Stores player information
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  draws INT DEFAULT 0,
  win_streak INT DEFAULT 0,
  total_games INT DEFAULT 0,
  rating INT DEFAULT 1200,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);
CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);

-- ============================================================
-- MATCHES TABLE
-- Stores individual game matches
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES players(id),
  player2_id UUID NOT NULL REFERENCES players(id),
  player1_symbol CHAR(1) DEFAULT 'X',
  player2_symbol CHAR(1) DEFAULT 'O',
  
  -- Game state
  board TEXT DEFAULT '[null,null,null,null,null,null,null,null,null]',
  current_player CHAR(1),
  winner CHAR(1), -- 'X', 'O', or 'D' for draw
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'finished', 'abandoned'
  
  -- Game mode
  mode VARCHAR(20) DEFAULT 'classic', -- 'classic' or 'timed'
  time_limit_seconds INT, -- For timed mode
  player1_time_remaining INT,
  player2_time_remaining INT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  
  CONSTRAINT check_winner CHECK (winner IN ('X', 'O', 'D', NULL))
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);

-- ============================================================
-- MOVES TABLE
-- Stores every move in a game (for replay/history)
-- ============================================================
CREATE TABLE IF NOT EXISTS moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id),
  position INT NOT NULL, -- 0-8 for board positions
  symbol CHAR(1) NOT NULL, -- 'X' or 'O'
  move_number INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_position CHECK (position >= 0 AND position <= 8)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_moves_match ON moves(match_id);
CREATE INDEX IF NOT EXISTS idx_moves_player ON moves(player_id);

-- ============================================================
-- LEADERBOARD VIEW
-- Shows top players ranked by wins/rating
-- ============================================================
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  id,
  username,
  wins,
  losses,
  draws,
  win_streak,
  total_games,
  rating,
  CASE 
    WHEN total_games = 0 THEN 0
    ELSE ROUND((wins::FLOAT / total_games) * 100, 2)
  END AS win_percentage,
  ROW_NUMBER() OVER (ORDER BY rating DESC, wins DESC) AS rank,
  created_at
FROM players
WHERE total_games > 0
ORDER BY rating DESC, wins DESC;

-- ============================================================
-- PLAYER STATISTICS VIEW
-- Shows detailed stats for a player
-- ============================================================
CREATE OR REPLACE VIEW player_stats AS
SELECT 
  p.id,
  p.username,
  p.wins,
  p.losses,
  p.draws,
  p.total_games,
  CASE 
    WHEN p.total_games = 0 THEN 0
    ELSE ROUND((p.wins::FLOAT / p.total_games) * 100, 2)
  END AS win_percentage,
  p.win_streak,
  p.rating,
  COUNT(DISTINCT m1.id) as matches_as_player1,
  COUNT(DISTINCT m2.id) as matches_as_player2,
  p.created_at,
  p.updated_at
FROM players p
LEFT JOIN matches m1 ON p.id = m1.player1_id
LEFT JOIN matches m2 ON p.id = m2.player2_id
GROUP BY p.id;

-- ============================================================
-- FUNCTION TO UPDATE MATCH RESULT
-- Updates player stats when a match ends
-- ============================================================
CREATE OR REPLACE FUNCTION update_player_stats_on_match_end()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when match status changes to finished
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    
    -- Handle regular win
    IF NEW.winner = 'X' THEN
      -- Player 1 won
      UPDATE players
      SET 
        wins = wins + 1,
        total_games = total_games + 1,
        win_streak = win_streak + 1,
        rating = rating + 10
      WHERE id = NEW.player1_id;
      
      -- Player 2 lost
      UPDATE players
      SET 
        losses = losses + 1,
        total_games = total_games + 1,
        win_streak = 0,
        rating = rating - 10
      WHERE id = NEW.player2_id;
      
    ELSIF NEW.winner = 'O' THEN
      -- Player 2 won
      UPDATE players
      SET 
        wins = wins + 1,
        total_games = total_games + 1,
        win_streak = win_streak + 1,
        rating = rating + 10
      WHERE id = NEW.player2_id;
      
      -- Player 1 lost
      UPDATE players
      SET 
        losses = losses + 1,
        total_games = total_games + 1,
        win_streak = 0,
        rating = rating - 10
      WHERE id = NEW.player1_id;
      
    ELSIF NEW.winner = 'D' OR NEW.status = 'draw' THEN
      -- Draw - both get 1 point each
      UPDATE players
      SET 
        draws = draws + 1,
        total_games = total_games + 1
      WHERE id IN (NEW.player1_id, NEW.player2_id);
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run the function
CREATE TRIGGER tr_update_player_stats_on_match_end
AFTER UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION update_player_stats_on_match_end();

-- ============================================================
-- INITIAL DATA (OPTIONAL)
-- Add some test players
-- ============================================================
INSERT INTO players (username, email, wins, losses, draws, total_games, rating)
VALUES 
  ('testplayer1', 'test1@example.com', 5, 2, 1, 8, 1250),
  ('testplayer2', 'test2@example.com', 3, 4, 1, 8, 1150),
  ('testplayer3', 'test3@example.com', 10, 3, 2, 15, 1350)
ON CONFLICT (username) DO NOTHING;
