// auth.ts - Player Authentication
// This module handles player login and account creation

interface AuthRequest {
  username: string;
  password: string;
}

interface AuthResponse {
  success: boolean;
  token?: string;
  user_id?: string;
  error?: string;
}

/**
 * Authenticate user - Login or Create account
 * Called when player enters username and password
 */
export function rpcAuthenticate(ctx: any, logger: any, nk: any, payload: string): string {
  const request: AuthRequest = JSON.parse(payload);
  
  // Validate input
  if (!request.username || request.username.trim() === '') {
    const response: AuthResponse = {
      success: false,
      error: 'Username is required'
    };
    return JSON.stringify(response);
  }

  if (!request.password || request.password.length < 4) {
    const response: AuthResponse = {
      success: false,
      error: 'Password must be at least 4 characters'
    };
    return JSON.stringify(response);
  }

  try {
    // Try to authenticate with Nakama's built-in system
    const userId = ctx.userId;
    
    if (userId) {
      // User already authenticated
      const response: AuthResponse = {
        success: true,
        user_id: userId
      };
      return JSON.stringify(response);
    }

    // For device authentication (simple approach)
    // Generate a device ID based on username
    const deviceId = `device_${request.username}_${Date.now()}`;

    const response: AuthResponse = {
      success: true,
      user_id: deviceId,
      token: `token_${Date.now()}_${Math.random()}`
    };

    return JSON.stringify(response);

  } catch (error: any) {
    const response: AuthResponse = {
      success: false,
      error: `Authentication failed: ${error.message}`
    };
    return JSON.stringify(response);
  }
}

/**
 * Get user profile
 */
export function rpcGetProfile(ctx: any, logger: any, nk: any, payload: string): string {
  const userId = ctx.userId;

  if (!userId) {
    return JSON.stringify({
      success: false,
      error: 'Not authenticated'
    });
  }

  try {
    // Get user account
    const accounts = nk.accountGetId(userId);
    
    if (!accounts) {
      return JSON.stringify({
        success: false,
        error: 'User not found'
      });
    }

    return JSON.stringify({
      success: true,
      user_id: userId,
      username: accounts.user.username,
      created_at: accounts.user.create_time
    });

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: `Failed to get profile: ${error.message}`
    });
  }
}

export const InitializeAuth = () => {
  // This function will be called during server initialization
  console.log('Authentication module loaded');
};