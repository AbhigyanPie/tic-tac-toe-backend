// match_handler.js - Core multiplayer game state management

function matchInit(ctx, logger, nk, params) {
  logger.info('Match initialized');
  
  const initialState = {
    board: Array(9).fill(null),
    current_player: 'X',
    player1_id: '',
    player2_id: '',
    player1_symbol: 'X',
    player2_symbol: 'O',
    winner: null,
    status: 'active',
    created_at: Date.now(),
    move_count: 0
  };

  return {
    state: initialState,
    tickRate: 5,
    handlerName: 'tictactoe'
  };
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  logger.info('Player attempting to join:', presence.userId);
  
  // Only allow 2 players
  if (state.player1_id && state.player2_id) {
    return {
      state,
      accept: false,
      reason: 'Match is full'
    };
  }

  return {
    state,
    accept: true
  };
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  // Assign players when they join
  for (const presence of presences) {
    if (!state.player1_id) {
      state.player1_id = presence.userId;
      logger.info('Player 1 joined:', presence.userId);
    } else if (!state.player2_id) {
      state.player2_id = presence.userId;
      logger.info('Player 2 joined:', presence.userId);
      
      // Broadcast that match is ready
      dispatcher.broadcastMessage(1, JSON.stringify({
        type: 'match_started',
        board: state.board,
        current_player: state.current_player,
        player1_id: state.player1_id,
        player2_id: state.player2_id,
        message: 'Game started! Player 1 (X) goes first'
      }));
    }
  }

  return state;
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (const presence of presences) {
    const leftPlayerId = presence.userId;
    logger.info('Player left:', leftPlayerId);
    
    if (state.status === 'active') {
      // Other player wins
      if (leftPlayerId === state.player1_id) {
        state.winner = state.player2_symbol;
      } else {
        state.winner = state.player1_symbol;
      }
      
      state.status = 'abandoned';
      
      dispatcher.broadcastMessage(1, JSON.stringify({
        type: 'opponent_left',
        winner: state.winner,
        message: 'Opponent disconnected. You win by default!'
      }));
    }
  }

  return state;
}

function checkWinner(board) {
  const winCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of winCombinations) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  for (const message of messages) {
    const userId = message.sender.userId;
    
    try {
      const moveData = JSON.parse(new TextDecoder().decode(message.data));
      
      if (state.status !== 'active') {
        continue;
      }

      // Validate it's this player's turn
      const playerSymbol = userId === state.player1_id 
        ? state.player1_symbol 
        : state.player2_symbol;
      
      if (state.current_player !== playerSymbol) {
        dispatcher.messageSendToPresence(
          ctx,
          message.sender,
          2,
          JSON.stringify({
            type: 'error',
            message: 'Not your turn. Current: ' + state.current_player
          })
        );
        continue;
      }

      // Validate position
      const position = moveData.position;
      if (position < 0 || position > 8 || state.board[position] !== null) {
        dispatcher.messageSendToPresence(
          ctx,
          message.sender,
          2,
          JSON.stringify({
            type: 'error',
            message: 'Invalid position or already occupied'
          })
        );
        continue;
      }

      // Make the move
      state.board[position] = playerSymbol;
      state.move_count++;

      // Check for winner
      const winner = checkWinner(state.board);
      const isBoardFull = state.board.every(cell => cell !== null);

      if (winner) {
        state.winner = winner;
        state.status = 'finished';
      } else if (isBoardFull) {
        state.status = 'draw';
      } else {
        state.current_player = playerSymbol === 'X' ? 'O' : 'X';
      }

      // Broadcast updated board
      dispatcher.broadcastMessage(1, JSON.stringify({
        type: 'move_made',
        board: state.board,
        current_player: state.current_player,
        position: position,
        winner: state.winner,
        status: state.status,
        message: winner 
          ? winner + ' won!' 
          : isBoardFull 
          ? 'Draw!' 
          : state.current_player + '\'s turn'
      }));

    } catch (error) {
      logger.error('Error processing move:', error.message);
    }
  }

  return state;
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  logger.info('Match terminating. Grace period:', graceSeconds);
  return { state };
}