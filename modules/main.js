// main.js - Nakama Server Module for Multiplayer Tic-Tac-Toe
// Version 2.1 - Complete with matchmaking, leaderboard, and game logic

// ============================================================
// CONSTANTS
// ============================================================
var OpCode = {
  GAME_STATE: 1,
  MOVE: 2,
  GAME_OVER: 3,
  ERROR: 4,
  TURN_UPDATE: 5,
  PLAYER_JOIN: 6,
  PLAYER_LEAVE: 7
};

var WIN_CONDITIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]              // Diagonals
];

// ============================================================
// MODULE INITIALIZATION
// ============================================================
function InitModule(ctx, logger, nk, initializer) {
  logger.info("============================================");
  logger.info("Initializing Tic-Tac-Toe module v2.1...");
  logger.info("============================================");

  // Register match handler
  initializer.registerMatch("tictactoe", {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal
  });

  // CRITICAL: Register matchmaker matched callback
  // This is called when the matchmaker finds 2 players
  initializer.registerMatchmakerMatched(matchmakerMatched);

  // Register RPC endpoints
  initializer.registerRpc("healthcheck", rpcHealthCheck);
  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("find_match", rpcFindMatch);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
  initializer.registerRpc("get_player_stats", rpcGetPlayerStats);
  initializer.registerRpc("update_stats", rpcUpdateStats);
  initializer.registerRpc("list_matches", rpcListMatches);

  logger.info("Registered: match handler, matchmaker, 7 RPCs");
  logger.info("Tic-Tac-Toe module ready!");
  logger.info("============================================");
}

// ============================================================
// MATCHMAKER MATCHED CALLBACK - THE KEY TO MATCHMAKING!
// ============================================================
function matchmakerMatched(ctx, logger, nk, matches) {
  logger.info("========== MATCHMAKER FOUND PLAYERS ==========");
  logger.info("Matched entries: " + matches.length);
  
  var userIds = [];
  var usernames = [];
  
  for (var i = 0; i < matches.length; i++) {
    var entry = matches[i];
    logger.info("Player " + (i + 1) + ": " + entry.presence.username + " (" + entry.presence.userId + ")");
    userIds.push(entry.presence.userId);
    usernames.push(entry.presence.username);
  }

  // Get game mode from string properties
  var gameMode = "classic";
  if (matches[0] && matches[0].properties && matches[0].properties.mode) {
    gameMode = matches[0].properties.mode;
  }

  try {
    // Create authoritative match
    var matchId = nk.matchCreate("tictactoe", {
      invited: userIds,
      usernames: usernames,
      mode: gameMode,
      fromMatchmaker: true
    });
    
    logger.info("Match created: " + matchId);
    logger.info("Mode: " + gameMode);
    logger.info("Players will auto-join this match");
    logger.info("==============================================");
    
    return matchId;
  } catch (error) {
    logger.error("Failed to create match: " + error.message);
    throw error;
  }
}

// ============================================================
// MATCH INITIALIZATION
// ============================================================
function matchInit(ctx, logger, nk, params) {
  logger.info("Match init - params: " + JSON.stringify(params));

  var state = {
    board: [null, null, null, null, null, null, null, null, null],
    players: {},
    playerSymbols: {},
    currentTurn: null,
    currentSymbol: "X",
    winner: null,
    gameOver: false,
    moveCount: 0,
    presences: {},
    emptyTicks: 0,
    gameStarted: false,
    invited: params.invited || [],
    mode: params.mode || "classic",
    fromMatchmaker: params.fromMatchmaker || false,
    createdAt: Date.now()
  };

  return {
    state: state,
    tickRate: 1,
    label: JSON.stringify({ 
      open: true, 
      players: 0,
      mode: state.mode
    })
  };
}

// ============================================================
// JOIN ATTEMPT - Validate if player can join
// ============================================================
function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  logger.info("Join attempt: " + presence.username + " (" + presence.userId + ")");
  
  // Allow reconnection
  if (state.players[presence.userId]) {
    logger.info("Reconnection allowed");
    return { state: state, accept: true };
  }

  // Check capacity
  var playerCount = Object.keys(state.players).length;
  if (playerCount >= 2) {
    logger.info("Match full - rejecting");
    return { state: state, accept: false, rejectMessage: "Match is full" };
  }

  // Check if game already in progress
  if (state.gameStarted && !state.invited.includes(presence.userId)) {
    logger.info("Game in progress - rejecting");
    return { state: state, accept: false, rejectMessage: "Game already started" };
  }

  logger.info("Join accepted");
  return { state: state, accept: true };
}

// ============================================================
// PLAYER JOINED
// ============================================================
function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  logger.info("Players joining: " + presences.length);

  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    logger.info("Processing: " + presence.username);
    
    state.presences[presence.userId] = presence;

    // Handle reconnection
    if (state.players[presence.userId]) {
      logger.info("Sending reconnection state");
      sendGameState(dispatcher, state, presence);
      continue;
    }

    // Assign symbol (first player gets X)
    var playerCount = Object.keys(state.players).length;
    var symbol = playerCount === 0 ? "X" : "O";

    state.players[presence.userId] = {
      odId: presence.odId,
      sessionId: presence.sessionId,
      username: presence.username || ("Player" + (playerCount + 1)),
      symbol: symbol,
      odId: presence.odId
    };
    state.playerSymbols[presence.userId] = symbol;

    logger.info("Assigned " + symbol + " to " + presence.username);

    // Send symbol assignment
    var assignMsg = JSON.stringify({
      type: "player_assign",
      yourSymbol: symbol,
      playerId: presence.userId
    });
    dispatcher.broadcastMessage(OpCode.PLAYER_JOIN, assignMsg, [presence]);

    // Check if 2 players - START GAME
    if (Object.keys(state.players).length === 2) {
      startGame(logger, dispatcher, state);
    }
  }

  state.emptyTicks = 0;
  return { state: state };
}

// ============================================================
// START GAME
// ============================================================
function startGame(logger, dispatcher, state) {
  logger.info(">>> STARTING GAME <<<");
  
  state.gameStarted = true;
  state.currentSymbol = "X";

  // Find X player for first turn
  var playerIds = Object.keys(state.playerSymbols);
  for (var i = 0; i < playerIds.length; i++) {
    if (state.playerSymbols[playerIds[i]] === "X") {
      state.currentTurn = playerIds[i];
      break;
    }
  }

  logger.info("First turn: " + state.currentTurn);

  // Send game_start to each player with their perspective
  var presenceIds = Object.keys(state.presences);
  for (var j = 0; j < presenceIds.length; j++) {
    var odId = presenceIds[j];
    var playerPresence = state.presences[odId];
    
    var startMsg = JSON.stringify({
      type: "game_start",
      board: state.board,
      currentTurn: state.currentTurn,
      currentSymbol: "X",
      yourSymbol: state.playerSymbols[odId],
      isYourTurn: state.currentTurn === odId,
      players: formatPlayers(state)
    });
    
    dispatcher.broadcastMessage(OpCode.GAME_STATE, startMsg, [playerPresence]);
  }

  // Update match label
  dispatcher.matchLabelUpdate(JSON.stringify({ 
    open: false, 
    started: true,
    players: 2,
    mode: state.mode
  }));
}

// ============================================================
// PLAYER LEFT
// ============================================================
function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    logger.info("Player left: " + presence.username);
    
    delete state.presences[presence.userId];

    // Handle forfeit if game in progress
    if (!state.gameOver && state.gameStarted) {
      var remainingIds = Object.keys(state.players).filter(function(id) {
        return id !== presence.userId;
      });
      
      if (remainingIds.length === 1) {
        var winnerId = remainingIds[0];
        var winnerSymbol = state.playerSymbols[winnerId];
        
        state.gameOver = true;
        state.winner = winnerSymbol;

        logger.info("Forfeit - Winner: " + winnerSymbol);

        // Update stats
        updatePlayerStats(nk, logger, winnerId, "win");
        updatePlayerStats(nk, logger, presence.userId, "loss");

        // Notify remaining player
        var forfeitMsg = JSON.stringify({
          type: "game_over",
          reason: "forfeit",
          winner: winnerSymbol,
          board: state.board
        });
        
        var remaining = state.presences[winnerId];
        if (remaining) {
          dispatcher.broadcastMessage(OpCode.GAME_OVER, forfeitMsg, [remaining]);
        }
      }
    }

    // Notify others
    var leaveMsg = JSON.stringify({
      type: "player_left",
      playerId: presence.userId,
      username: presence.username
    });
    broadcastToAll(dispatcher, state, OpCode.PLAYER_LEAVE, leaveMsg);
  }

  return { state: state };
}

// ============================================================
// MATCH LOOP - Process moves
// ============================================================
function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  // Auto-terminate empty matches
  if (Object.keys(state.presences).length === 0) {
    state.emptyTicks++;
    if (state.emptyTicks > 60) {
      logger.info("Match empty too long - terminating");
      return null;
    }
  } else {
    state.emptyTicks = 0;
  }

  // Process messages
  for (var i = 0; i < messages.length; i++) {
    var message = messages[i];
    
    if (message.opCode === OpCode.MOVE) {
      processMove(logger, nk, dispatcher, state, message);
    }
  }

  return { state: state };
}

// ============================================================
// PROCESS MOVE
// ============================================================
function processMove(logger, nk, dispatcher, state, message) {
  var senderId = message.sender.userId;
  
  try {
    var data = JSON.parse(nk.binaryToString(message.data));
    var position = data.position;
    
    logger.info("Move from " + senderId + " at position " + position);

    // Validations
    if (state.gameOver) {
      sendError(dispatcher, message.sender, "Game is already over");
      return;
    }

    if (!state.gameStarted) {
      sendError(dispatcher, message.sender, "Game hasn't started");
      return;
    }

    if (state.currentTurn !== senderId) {
      sendError(dispatcher, message.sender, "Not your turn");
      return;
    }

    if (typeof position !== "number" || position < 0 || position > 8) {
      sendError(dispatcher, message.sender, "Invalid position");
      return;
    }

    if (state.board[position] !== null) {
      sendError(dispatcher, message.sender, "Cell already taken");
      return;
    }

    // Make move
    var symbol = state.playerSymbols[senderId];
    state.board[position] = symbol;
    state.moveCount++;

    logger.info("Board: " + JSON.stringify(state.board));

    // Check win
    var winResult = checkWin(state.board, symbol);
    if (winResult.won) {
      state.gameOver = true;
      state.winner = symbol;
      
      logger.info("WINNER: " + symbol);

      // Update stats
      var playerIds = Object.keys(state.players);
      for (var i = 0; i < playerIds.length; i++) {
        var pid = playerIds[i];
        if (state.playerSymbols[pid] === symbol) {
          updatePlayerStats(nk, logger, pid, "win");
        } else {
          updatePlayerStats(nk, logger, pid, "loss");
        }
      }

      // Send game over
      var winMsg = JSON.stringify({
        type: "game_over",
        reason: "win",
        winner: symbol,
        board: state.board,
        winningLine: winResult.line
      });
      broadcastToAll(dispatcher, state, OpCode.GAME_OVER, winMsg);
      return;
    }

    // Check draw
    if (state.moveCount >= 9) {
      state.gameOver = true;
      state.winner = "draw";
      
      logger.info("DRAW");

      // Update stats
      var pIds = Object.keys(state.players);
      for (var j = 0; j < pIds.length; j++) {
        updatePlayerStats(nk, logger, pIds[j], "draw");
      }

      var drawMsg = JSON.stringify({
        type: "game_over",
        reason: "draw",
        winner: "draw",
        board: state.board
      });
      broadcastToAll(dispatcher, state, OpCode.GAME_OVER, drawMsg);
      return;
    }

    // Switch turn
    state.currentSymbol = symbol === "X" ? "O" : "X";
    var allPlayerIds = Object.keys(state.playerSymbols);
    for (var k = 0; k < allPlayerIds.length; k++) {
      if (allPlayerIds[k] !== senderId) {
        state.currentTurn = allPlayerIds[k];
        break;
      }
    }

    // Send state update to all players
    var presenceIds = Object.keys(state.presences);
    for (var m = 0; m < presenceIds.length; m++) {
      var odId = presenceIds[m];
      var presence = state.presences[odId];
      
      var updateMsg = JSON.stringify({
        type: "game_state",
        board: state.board,
        lastMove: { position: position, symbol: symbol },
        currentTurn: state.currentTurn,
        currentSymbol: state.currentSymbol,
        yourSymbol: state.playerSymbols[odId],
        isYourTurn: state.currentTurn === odId,
        moveCount: state.moveCount
      });
      
      dispatcher.broadcastMessage(OpCode.GAME_STATE, updateMsg, [presence]);
    }

  } catch (error) {
    logger.error("Move error: " + error.message);
    sendError(dispatcher, message.sender, "Invalid move data");
  }
}

// ============================================================
// MATCH TERMINATE & SIGNAL
// ============================================================
function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  logger.info("Match terminating");
  return { state: state };
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
  return { state: state, data: "ok" };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function checkWin(board, symbol) {
  for (var i = 0; i < WIN_CONDITIONS.length; i++) {
    var c = WIN_CONDITIONS[i];
    if (board[c[0]] === symbol && board[c[1]] === symbol && board[c[2]] === symbol) {
      return { won: true, line: c };
    }
  }
  return { won: false };
}

function formatPlayers(state) {
  var result = {};
  var ids = Object.keys(state.players);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    result[id] = {
      username: state.players[id].username,
      symbol: state.players[id].symbol
    };
  }
  return result;
}

function sendGameState(dispatcher, state, presence) {
  var msg = JSON.stringify({
    type: "game_state",
    board: state.board,
    currentTurn: state.currentTurn,
    currentSymbol: state.currentSymbol,
    yourSymbol: state.playerSymbols[presence.userId],
    isYourTurn: state.currentTurn === presence.userId,
    players: formatPlayers(state),
    gameOver: state.gameOver,
    winner: state.winner,
    gameStarted: state.gameStarted
  });
  dispatcher.broadcastMessage(OpCode.GAME_STATE, msg, [presence]);
}

function sendError(dispatcher, presence, message) {
  var msg = JSON.stringify({ type: "error", message: message });
  dispatcher.broadcastMessage(OpCode.ERROR, msg, [presence]);
}

function broadcastToAll(dispatcher, state, opCode, message) {
  var presences = [];
  var ids = Object.keys(state.presences);
  for (var i = 0; i < ids.length; i++) {
    presences.push(state.presences[ids[i]]);
  }
  if (presences.length > 0) {
    dispatcher.broadcastMessage(opCode, message, presences);
  }
}

// ============================================================
// PLAYER STATS (using Nakama Storage)
// ============================================================
function updatePlayerStats(nk, logger, odId, result) {
  try {
    // Read current stats
    var reads = [{
      collection: "player_stats",
      key: "stats",
      userId: odId
    }];
    
    var objects = nk.storageRead(reads);
    
    var stats = {
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      winStreak: 0,
      currentStreak: 0,
      rating: 1200
    };

    if (objects && objects.length > 0 && objects[0].value) {
      stats = JSON.parse(objects[0].value);
    }

    // Update based on result
    stats.totalGames++;
    
    if (result === "win") {
      stats.wins++;
      stats.currentStreak++;
      stats.winStreak = Math.max(stats.winStreak, stats.currentStreak);
      stats.rating += 25;
    } else if (result === "loss") {
      stats.losses++;
      stats.currentStreak = 0;
      stats.rating = Math.max(0, stats.rating - 20);
    } else if (result === "draw") {
      stats.draws++;
      stats.rating += 5;
    }

    // Write updated stats
    var writes = [{
      collection: "player_stats",
      key: "stats",
      userId: odId,
      value: JSON.stringify(stats),
      permissionRead: 2,
      permissionWrite: 1
    }];
    
    nk.storageWrite(writes);
    logger.info("Stats updated for " + odId + ": " + result);
    
  } catch (error) {
    logger.error("Stats update failed: " + error.message);
  }
}

// ============================================================
// RPC ENDPOINTS
// ============================================================
function rpcHealthCheck(ctx, logger, nk, payload) {
  return JSON.stringify({ 
    status: "ok", 
    version: "2.1",
    timestamp: Date.now()
  });
}

function rpcCreateMatch(ctx, logger, nk, payload) {
  try {
    var params = payload ? JSON.parse(payload) : {};
    var matchId = nk.matchCreate("tictactoe", {
      mode: params.mode || "classic",
      createdBy: ctx.userId
    });
    return JSON.stringify({ success: true, matchId: matchId });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function rpcFindMatch(ctx, logger, nk, payload) {
  try {
    var params = payload ? JSON.parse(payload) : {};
    var mode = params.mode || "classic";
    
    // Search for open matches
    var query = "+label.open:true +label.mode:" + mode;
    var matches = nk.matchList(10, true, null, 1, 1, query);
    
    if (matches && matches.length > 0) {
      return JSON.stringify({
        success: true,
        matchId: matches[0].matchId,
        found: true
      });
    }
    
    // Create new match
    var matchId = nk.matchCreate("tictactoe", { mode: mode });
    return JSON.stringify({
      success: true,
      matchId: matchId,
      created: true
    });
    
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function rpcGetLeaderboard(ctx, logger, nk, payload) {
  logger.info("Fetching leaderboard");
  
  try {
    var params = payload ? JSON.parse(payload) : {};
    var limit = params.limit || 50;
    
    // List all player stats
    var cursor = null;
    var allStats = [];
    
    // We need to iterate through storage - get from all users
    // Using storageList for collection browsing
    var result = nk.storageList(null, "player_stats", limit, cursor);
    
    if (result && result.objects) {
      for (var i = 0; i < result.objects.length; i++) {
        var obj = result.objects[i];
        var stats = JSON.parse(obj.value);
        
        // Get username
        var username = "Unknown";
        try {
          var users = nk.usersGetId([obj.userId]);
          if (users && users.length > 0) {
            username = users[0].username || users[0].displayName || "Player";
          }
        } catch (e) {
          logger.warn("Could not get username: " + e.message);
        }
        
        allStats.push({
          odId: obj.userId,
          username: username,
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          draws: stats.draws || 0,
          totalGames: stats.totalGames || 0,
          winStreak: stats.winStreak || 0,
          rating: stats.rating || 1200
        });
      }
    }
    
    // Sort by rating descending
    allStats.sort(function(a, b) {
      return b.rating - a.rating;
    });
    
    // Add ranks
    for (var j = 0; j < allStats.length; j++) {
      allStats[j].rank = j + 1;
    }
    
    logger.info("Returning " + allStats.length + " leaderboard entries");
    
    return JSON.stringify({
      success: true,
      leaderboard: allStats,
      count: allStats.length
    });
    
  } catch (error) {
    logger.error("Leaderboard error: " + error.message);
    return JSON.stringify({
      success: false,
      error: error.message,
      leaderboard: []
    });
  }
}

function rpcGetPlayerStats(ctx, logger, nk, payload) {
  try {
    var targetId = ctx.userId;
    
    if (payload) {
      var params = JSON.parse(payload);
      if (params.userId) targetId = params.userId;
    }
    
    var reads = [{
      collection: "player_stats",
      key: "stats",
      userId: targetId
    }];
    
    var objects = nk.storageRead(reads);
    
    var stats = {
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      winStreak: 0,
      rating: 1200
    };
    
    if (objects && objects.length > 0 && objects[0].value) {
      stats = JSON.parse(objects[0].value);
    }
    
    return JSON.stringify({
      success: true,
      odId: targetId,
      stats: stats
    });
    
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function rpcUpdateStats(ctx, logger, nk, payload) {
  try {
    var params = JSON.parse(payload);
    updatePlayerStats(nk, logger, ctx.userId, params.result);
    return JSON.stringify({ success: true });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

function rpcListMatches(ctx, logger, nk, payload) {
  try {
    var matches = nk.matchList(100, true, null, null, null, null);
    var list = [];
    
    if (matches) {
      for (var i = 0; i < matches.length; i++) {
        list.push({
          matchId: matches[i].matchId,
          size: matches[i].size,
          label: matches[i].label ? JSON.parse(matches[i].label) : {}
        });
      }
    }
    
    return JSON.stringify({ success: true, matches: list });
  } catch (error) {
    return JSON.stringify({ success: false, error: error.message });
  }
}