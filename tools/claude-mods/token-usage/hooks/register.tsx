import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ledger, Snapshot, Totals } from '../types'

const PANE = 'token-usage'
const STORE_KEY = 'ledger'
const MAX_SESSIONS = 50
const BAR = 24

const zero = (): Totals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 })
const emptyLedger = (): Ledger => ({ total: zero(), byDay: {}, sessions: {} })

const ledger = atom({ plugin: 'token-usage', key: 'ledger' } as const, emptyLedger())
const snapshot = atom({ plugin: 'token-usage', key: 'snapshot' } as const, {
  sessionId: '',
  limits: [],
  costUsd: null,
  contextTokens: null,
  contextWindow: 0,
  contextPercent: null,
} as Snapshot)

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const add = (t: Totals, u: Usage): Totals => ({
  input: t.input + u.input_tokens,
  output: t.output + u.output_tokens,
  cacheRead: t.cacheRead + u.cache_read_input_tokens,
  cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
  turns: t.turns + 1,
})

export const sum = (t: Totals) => t.input + t.output + t.cacheRead + t.cacheWrite

export const fmt = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k`
  : String(n)

export const bar = (ratio: number, width = BAR) => {
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5時間枠',
  seven_day: '7日間枠',
  spend_limit: '利用上限',
}

export const record = (l: Ledger, u: Usage, sessionId: string, now: number): Ledger => {
  const day = dayOf(now)
  const prev = l.sessions[sessionId] ?? { startedAt: now, totals: zero() }
  let sessions = { ...l.sessions, [sessionId]: { ...prev, totals: add(prev.totals, u) } }
  const ids = Object.keys(sessions)
  if (ids.length > MAX_SESSIONS) {
    const keep = Object.entries(sessions).sort(([, a], [, b]) => b.startedAt - a.startedAt).slice(0, MAX_SESSIONS)
    sessions = Object.fromEntries(keep)
  }
  const days = { ...l.byDay, [day]: add(l.byDay[day] ?? zero(), u) }
  const byDay = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-30))

  return { total: add(l.total, u), byDay, sessions }
}

const refresh = async ($: EngineInterface) => {
  const u = await $.session.usage()
  const sessionId = await $.session.id()
  await update($, snapshot, () => ({
    sessionId,
    limits: u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    costUsd: u.cost?.usd ?? null,
    contextTokens: u.context.tokens ?? null,
    contextWindow: u.context.window,
    contextPercent: u.context.percent ?? null,
  }))
}

const status = async ($: EngineInterface) => {
  const l = await read($, ledger)
  const s = await read($, snapshot)
  const mine = l.sessions[s.sessionId]?.totals ?? zero()
  const five = s.limits.find(r => r.kind === 'five_hour')
  $.ui.status(`🪙 session ${fmt(sum(mine))}${five ? ` · 5h ${five.percentUsed}%` : ''}`)
}

export const summary = (l: Ledger, s: Snapshot): string => {
  const mine = l.sessions[s.sessionId]?.totals ?? zero()
  const lines = ['■ ① アカウント全体']
  if (s.limits.length === 0) lines.push('  レート制限: まだ取得していません(最初の応答後に表示)')
  for (const r of s.limits) {
    lines.push(`  ${(LIMIT_NAMES[r.kind] ?? r.kind).padEnd(6)} ${bar(r.percentUsed / 100)} ${r.percentUsed}%${r.resetsAt ? `  (リセット ${r.resetsAt.slice(5, 16).replace('T', ' ')})` : ''}`)
  }
  lines.push(`  累計(記録分): ${fmt(sum(l.total))} tokens / ${l.total.turns} turns / ${Object.keys(l.sessions).length} sessions`)
  const days = Object.entries(l.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-7)
  const peak = Math.max(1, ...days.map(([, t]) => sum(t)))
  for (const [d, t] of days) lines.push(`  ${d.slice(5)} ${bar(sum(t) / peak, 16)} ${fmt(sum(t))}`)
  lines.push('', '■ ② このセッション')
  const total = Math.max(1, sum(mine))
  lines.push(`  合計 ${fmt(sum(mine))} tokens / ${mine.turns} turns${s.costUsd !== null ? ` / $${s.costUsd.toFixed(2)}` : ''}`)
  const rows: [string, number][] = [
    ['入力', mine.input], ['出力', mine.output], ['ｷｬｯｼｭ読', mine.cacheRead], ['ｷｬｯｼｭ書', mine.cacheWrite],
  ]
  for (const [name, n] of rows) lines.push(`  ${name.padEnd(5)} ${bar(n / total, 16)} ${fmt(n)}`)
  if (s.contextPercent !== null) lines.push(`  コンテキスト ${bar(s.contextPercent / 100, 16)} ${s.contextPercent}% (${fmt(s.contextTokens ?? 0)}/${fmt(s.contextWindow)})`)

  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = (await $.store.get(STORE_KEY)) as Ledger | undefined
    const held = await read($, ledger)
    if (stored && sum(stored.total) > sum(held.total)) await update($, ledger, () => stored)
    await refresh($)
    await $.command.register({ name: 'token-usage', description: 'トークン使用量(アカウント全体/このセッション)を表示' })
    void status($)

    return next(e)
  })

  on('command.run', { command: 'token-usage' }, async $ => {
    await refresh($)
    void $.ui.open({ id: PANE, title: 'Token usage' })

    return { text: summary(await read($, ledger), await read($, snapshot)) }
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.usage) {
      const sessionId = await $.session.id()
      const now = await $.clock.now()
      const usage = e.usage
      await update($, ledger, l => record(l, usage, sessionId, now))
      await $.store.set(STORE_KEY, await read($, ledger))
      await status($)
    }

    return ran
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    await status($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const text = summary(await read($, ledger), await read($, snapshot))

    return (
      <Box flexDirection="column">
        {text.split('\n').map(line => (
          <Text bold={line.startsWith('■')} color={line.startsWith('■') ? 'claude' : undefined}>{line || ' '}</Text>
        ))}
      </Box>
    )
  })
}
