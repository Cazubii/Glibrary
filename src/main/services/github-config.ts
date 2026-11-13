/** Client ID é público; a aplicação não empacota client secret. */
export function getGithubOAuthClientId(): string {
  return typeof __GLIBRARY_GITHUB_OAUTH_CLIENT_ID__ === 'string'
    ? __GLIBRARY_GITHUB_OAUTH_CLIENT_ID__.trim()
    : '';
}
