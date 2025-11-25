/**
 * AWS Cognito Configuration
 */

export const cognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_Jr0OTariE',
  userPoolWebClientId: '2oah1h1bdsushki851ftkale6h',
  authenticationFlowType: 'USER_PASSWORD_AUTH' as const,

  // OAuth settings (optional, for social login in the future)
  oauth: {
    domain: '', // Will be set if using hosted UI
    scope: ['phone', 'email', 'openid', 'profile'],
    redirectSignIn: 'http://localhost:5173/',
    redirectSignOut: 'http://localhost:5173/',
    responseType: 'code' as const,
  },
};

// API Configuration
export const apiConfig = {
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8001',
};