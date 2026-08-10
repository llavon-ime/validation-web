export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
  DEV_AUTH_BYPASS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_INSTALLATION_ID?: string;
  GITHUB_DATASET_OWNER?: string;
  GITHUB_DATASET_REPO?: string;
  GITHUB_DATASET_BRANCH?: string;
  SESSION_SECRET?: string;
}

