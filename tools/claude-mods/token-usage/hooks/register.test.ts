import { expect, test } from 'claude-code/testing'

import { bar, fmt, record, sum, summary } from './register'

const u = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 }

test('records a turn into session, day and account totals', async () => {
  const empty = { total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }, byDay: {}, sessions: {} }
  const now = Date.UTC(2026, 9, 5)
  const l = record(record(empty, u, 's1', now), u, 's2', now)
  expect(sum(l.total)).toBe(2700)
  expect(l.total.turns).toBe(2)
  expect(sum(l.sessions.s1!.totals)).toBe(1350)
  expect(l.byDay['2026-10-05']!.turns).toBe(2)

  const text = summary(l, { sessionId: 's1', limits: [{ kind: 'five_hour', percentUsed: 50 }], costUsd: 0.5, contextTokens: 1000, contextWindow: 200000, contextPercent: 1 })
  expect(text).toContain('5時間枠')
  expect(text).toContain('50%')
  expect(text).toContain('1.4k tokens / 1 turns / $0.50')
})

test('formats numbers and bars', async () => {
  expect(fmt(1234567)).toBe('1.23M')
  expect(bar(0.5, 4)).toBe('██░░')
})
