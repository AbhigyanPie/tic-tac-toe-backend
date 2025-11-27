// matchmaking.js - Find Opponents

const waitingPlayers = new Map();

function rpcFindOpponent(ctx, logger, nk, payload) {
  try {
    const request = JSON.parse(payload);
    const userId = request.user_id;
    const mode = request.mode || 'classic';

    if (!userId) {
      return JSON.stringify({
        success: false,
        error: 'User ID is required'
      });
    }

    // Check if there's a waiting player
    const waitingList = Array.from(waitingPlayers.keys());

    if (waitingList.length > 0) {
      // Found a waiting player - create match!
      const opponentId = waitingList[0];
      waitingPlayers.delete(opponentId);

      // Create actual Nakama match
      const matchId = nk.matchCreate('tictactoe', {
        mode: mode
      });

      logger.info('Created match:', matchId, 'between', userId, 'and', opponentId);

      return JSON.stringify({
        success: true,
        match_id: matchId,
        opponent: {
          user_id: opponentId,
          username: 'Player_' + opponentId.substring(0, 8)
        },
        message: 'Match created! Joining...'
      });

    } else {
      // No waiting player found - add current player to waiting list
      waitingPlayers.set(userId, {
        user_id: userId,
        mode: mode,
        joined_at: Date.now()
      });

      logger.info('Player', userId, 'waiting for opponent');

      return JSON.stringify({
        success: true,
        message: 'Waiting for opponent...',
        match_id: null
      });
    }

  } catch (error) {
    logger.error('Matchmaking failed:', error.message);
    return JSON.stringify({
      success: false,
      error: 'Matchmaking failed: ' + error.message
    });
  }
}

function InitializeMatchmaking() {
  console.log('Matchmaking module loaded');
}