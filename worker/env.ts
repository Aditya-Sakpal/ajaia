export interface Env {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}
