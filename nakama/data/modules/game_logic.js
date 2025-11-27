// game_logic.js - Game Rules and Move Validation

function checkWinner(board) {
  const winCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const combo of winCombinations) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // Return 'X' or 'O'
    }
  }

  return null; // No winner yet
}

function rpcMakeMove(ctx, logger, nk, payload) {
  try {
    const request = JSON.parse(payload);
    const position = request.position;

    if (position < 0 || position > 8) {
      return JSON.stringify({
        success: false,
        error: 'Position must be between 0 and 8'
      });
    }

    return JSON.stringify({
      success: true,
      message: 'Move validated'
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: 'Failed to make move: ' + error.message
    });
  }
}

function InitializeGameLogic() {
  console.log('Game Logic module loaded');
}