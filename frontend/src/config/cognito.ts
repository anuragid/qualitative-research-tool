/**
 * AWS Cognito Configuration
 * Reads from environment variables with fallbacks for development
 */

export const cognitoConfig = {
  region: import.meta.env.VITE_COGNITO_REGION || 'us-east-1',
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'us-east-1_Jr0OTariE',
  userPoolWebClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID || '2oah1h1bdsushki851ftkale6h',
  authenticationFlowType: 'USER_PASSWORD_AUTH' as const,

  // OAuth settings (optional, for social login in the future)
  oauth: {
    domain: '', // Will be set if using hosted UI
    scope: ['phone', 'email', 'openid', 'profile'],
    redirectSignIn: import.meta.env.VITE_APP_URL || 'http://localhost:5173/',
    redirectSignOut: import.meta.env.VITE_APP_URL || 'http://localhost:5173/',
    responseType: 'code' as const,
  },
};

// API Configuration
export const apiConfig = {
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8001',
};