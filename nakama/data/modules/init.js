// init.js - Initialize all modules

function InitModule(ctx, logger, nk, initializer) {
  logger.info('Initializing Nakama modules...');
  
  // Register RPC functions
  initializer.registerRpc('Authenticate', rpcAuthenticateUser);
  initializer.registerRpc('FindOpponent', rpcFindOpponent);
  initializer.registerRpc('MakeMove', rpcMakeMove);
  
  logger.info('RPC functions registered');
  
  // Initialize modules
  InitializeAuth();
  InitializeGameLogic();
  InitializeMatchmaking();
  
  logger.info('Module initialization complete');
}