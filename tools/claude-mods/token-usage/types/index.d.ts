export type Totals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turns: number
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Ledger = {
  total: Totals
  byDay: Record<string, Totals>
  sessions: Record<string, { startedAt: number; totals: Totals }>
}

export type Snapshot = {
  sessionId: string
  limits: Limit[]
  costUsd: number | null
  contextTokens: number | null
  contextWindow: number
  contextPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'token-usage': {
      ledger: Ledger
      snapshot: Snapshot
    }
  }
}
