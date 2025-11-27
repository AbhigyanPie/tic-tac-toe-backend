function rpcLogin(ctx, logger, nk, payload) {
  try {
    const request = JSON.parse(payload);
    const username = request.username;

    if (!username || username.trim() === '') {
      return JSON.stringify({
        success: false,
        error: 'Username required'
      });
    }

    logger.info('Custom auth for user:', username);

    return JSON.stringify({
      success: true,
      user_id: ctx.userId,
      message: 'Logged in as ' + username
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error.message
    });
  }
}