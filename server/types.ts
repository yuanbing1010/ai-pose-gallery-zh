import type { PublicUser } from '../shared/studio'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS: Fetcher
  US_RELAY?: DurableObjectNamespace
  GENERATION_QUEUE?: DurableObjectNamespace
  GENERATION_RUNNER?: DurableObjectNamespace
  APP_ENCRYPTION_KEY?: string
  DEV_ASSETS_ORIGIN?: string
  BOOTSTRAP_ADMIN_USERNAME?: string
  BOOTSTRAP_ADMIN_PASSWORD?: string
  BOOTSTRAP_SETUP_TOKEN?: string
  GEMINI_API_KEY?: string
  OPENAI_API_KEY?: string
  XAI_API_KEY?: string
  MUSE_API_KEY?: string
  WECHAT_APP_ID?: string
  WECHAT_APP_SECRET?: string
}

export interface AppVariables {
  user: PublicUser | null
  sessionId: string | null
  adminUser: PublicUser | null
  adminSessionId: string | null
}

export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}
