import { describe, expect, it } from 'vitest'
import { removeDevice, renameDevice } from '@/editor/ops'
import { buildGraph } from '../graph'
import { referenceIssues } from '../model'
import { defaultTerminals } from '../terminals'
import { tiny } from './fixture'

// Netz → QS (changeover I/II) → XB (terminal block) → F1; G is the backup source on group II
function wired(position?: string) {
  return tiny({
    rows: [{ id: 'r1', modules: 12, items: [] }],
    points: [],
    devices: [
      { id: 'N', type: 'meter', terminals: [{ id: '2', side: 'bottom', role: 'out' }] },
      { id: 'G', type: 'other', terminals: [{ id: 'out', role: 'out' }] },
      {
        id: 'QS',
        type: 'ats',
        position,
        terminals: [
          { id: 'I.1', role: 'in', group: 'I', to: 'N.2' },
          { id: 'II.1', role: 'in', group: 'II', to: 'G.out' },
          { id: '2', side: 'bottom', role: 'out' },
        ],
      },
      { id: 'XB', type: 'terminal', terminals: [{ id: '1', role: 'bus', to: 'QS.2' }, { id: '2', role: 'bus' }] },
      // stored on the block's side on purpose: a link is read from either end
      { id: 'F1', type: 'mcb', upstream: 'N', terminals: [{ id: '1', role: 'in' }, { id: '2', side: 'bottom', role: 'out' }] },
    ],
  })
}

describe('terminals', () => {
  it('derives feeders from links in either direction and through terminal blocks', () => {
    const d = wired()
    d.devices.find((x) => x.id === 'XB')!.terminals[1]!.to = 'F1.1'
    const g = buildGraph(d)
    expect(g.upstreamOf('XB')).toBe('QS')
    // links win over the hand-set upstream
    expect(g.upstreamOf('F1')).toBe('XB')
    expect(g.ancestors('F1').map((a) => a.id)).toEqual(['XB', 'QS', 'N'])
  })

  it('falls back to the hand-set upstream when no link names a feeder', () => {
    expect(buildGraph(wired()).upstreamOf('F1')).toBe('N')
  })

  it('follows the changeover position, and position 0 cuts everything below', () => {
    expect(buildGraph(wired()).upstreamOf('QS')).toBe('N')
    expect(buildGraph(wired('II')).upstreamOf('QS')).toBe('G')
    const off = buildGraph(wired('0'))
    expect(off.isPowered('QS', new Set())).toBe(false)
    expect(off.isFed('XB', new Set())).toBe(false)
    expect(buildGraph(wired('I')).isFed('XB', new Set())).toBe(true)
    // the live group without a linked source makes the switch a root, not a fallback to group I
    const g2 = wired('II')
    g2.devices.find((x) => x.id === 'QS')!.terminals[1]!.to = undefined
    expect(buildGraph(g2).upstreamOf('QS')).toBeUndefined()
  })

  it('reports dangling links and duplicate terminal ids', () => {
    const d = wired()
    d.devices.find((x) => x.id === 'F1')!.terminals.push({ id: '1', side: 'top', role: 'in', to: 'XB.9' })
    const msgs = referenceIssues(d).map((i) => i.message)
    expect(msgs).toContain('duplicate terminal F1.1')
    expect(msgs).toContain('unknown terminal XB.9')
    expect(referenceIssues(wired())).toEqual([])
  })

  it('keeps links on rename and drops them on removal', () => {
    const d = wired()
    renameDevice(d, 'QS', 'QS1')
    expect(d.devices.find((x) => x.id === 'XB')!.terminals[0]!.to).toBe('QS1.2')
    expect(buildGraph(d).upstreamOf('XB')).toBe('QS1')
    removeDevice(d, 'QS1')
    expect(d.devices.find((x) => x.id === 'XB')!.terminals[0]!.to).toBeUndefined()
    expect(referenceIssues(d)).toEqual([])
  })

  it('generates the usual DIN terminal layout per type', () => {
    const ids = (t: ReturnType<typeof defaultTerminals>) => t.map((x) => `${x.id}:${x.role}:${x.conductor ?? '-'}`)
    const mcb3 = { id: 'Q', type: 'mcb', poles: 3 } as Parameters<typeof defaultTerminals>[0]
    expect(ids(defaultTerminals(mcb3))).toEqual(['1:in:L1', '3:in:L2', '5:in:L3', '2:out:L1', '4:out:L2', '6:out:L3'])
    const ats = defaultTerminals({ id: 'S', type: 'ats', poles: 4 } as Parameters<typeof defaultTerminals>[0])
    expect(ats.filter((t) => t.group === 'II').map((t) => t.id)).toEqual(['II.1', 'II.3', 'II.5', 'II.7'])
    expect(ats.filter((t) => t.role === 'out')).toHaveLength(4)
    const block = defaultTerminals({ id: 'X', type: 'terminal', poles: 1 } as Parameters<typeof defaultTerminals>[0])
    expect(block.every((t) => t.role === 'bus')).toBe(true)
    // a distribution block clamps on both faces: half the terminals on top, half below
    const dist = defaultTerminals({ id: 'XB', type: 'distribution-block', poles: 1 } as Parameters<typeof defaultTerminals>[0])
    expect(dist.map((t) => t.side)).toEqual(['top', 'top', 'top', 'bottom', 'bottom', 'bottom'])
    // no undefined keys: the YAML export cannot dump them
    expect(defaultTerminals({ id: 'Q', type: 'mcb', poles: 1 } as Parameters<typeof defaultTerminals>[0])[0]).not.toHaveProperty('conductor')
  })
})

describe('terminal checks', () => {
  it('flags a link whose two ends name different conductors', async () => {
    const { runChecks } = await import('../checks')
    const d = wired()
    const qs = d.devices.find((x) => x.id === 'QS')!
    qs.terminals[0]!.conductor = 'L1'
    d.devices.find((x) => x.id === 'N')!.terminals[0]!.conductor = 'N'
    const codes = runChecks(d, buildGraph(d)).map((r) => r.code)
    expect(codes).toContain('conductor-mismatch')
    d.devices.find((x) => x.id === 'N')!.terminals[0]!.conductor = 'L1'
    expect(runChecks(d, buildGraph(d)).map((r) => r.code)).not.toContain('conductor-mismatch')
  })
})

describe('terminal block colour', async () => {
  const { blockColor } = await import('../model')
  it('takes the hand-set colour, else the one shared conductor, else nothing', () => {
    const term = (c?: string) => ({ id: '1', side: 'top', role: 'bus', ...(c ? { conductor: c } : {}) }) as never
    expect(blockColor({ color: 'red', terminals: [term('N')] })).toBe('red')
    expect(blockColor({ terminals: [term('L1'), term('L1')] })).toBe('brown')
    expect(blockColor({ terminals: [term('PE')] })).toBe('green-yellow')
    expect(blockColor({ terminals: [term('L1'), term('L2')] })).toBeUndefined()
    expect(blockColor({ terminals: [] })).toBeUndefined()
  })
})

describe('terminal rename', () => {
  it('moves links along with the id and refuses taken or empty ids', async () => {
    const { renameTerminal } = await import('@/editor/ops')
    const d = wired()
    expect(renameTerminal(d, 'QS', '2', '2T1')).toBe(true)
    expect(d.devices.find((x) => x.id === 'XB')!.terminals[0]!.to).toBe('QS.2T1')
    expect(buildGraph(d).upstreamOf('XB')).toBe('QS')
    expect(renameTerminal(d, 'QS', '2T1', 'I.1')).toBe(false)
    expect(renameTerminal(d, 'QS', '2T1', '  ')).toBe(false)
    expect(referenceIssues(d)).toEqual([])
  })
})

describe('several feeders per group', () => {
  it('is powered only while every live feeder is', () => {
    const d = tiny({
      rows: [{ id: 'r1', modules: 12, items: [] }],
      points: [],
      devices: [
        { id: 'A', type: 'mcb', terminals: [{ id: '2', side: 'bottom', role: 'out' }] },
        { id: 'B', type: 'mcb', terminals: [{ id: '2', side: 'bottom', role: 'out' }] },
        {
          id: 'D',
          type: 'mcb',
          poles: 2,
          terminals: [
            { id: '1', role: 'in', to: 'A.2' },
            { id: '3', role: 'in', to: 'B.2' },
          ],
        },
      ],
    })
    const g = buildGraph(d)
    expect(g.upstreamOf('D')).toBe('A')
    expect(g.feedersOf('D')).toEqual(['A', 'B'])
    expect(g.isFed('D', new Set())).toBe(true)
    // switching off the second feeder, not the tree parent, still cuts D
    expect(g.isFed('D', new Set(['B']))).toBe(false)
    expect(g.isFed('D', new Set(['A']))).toBe(false)
  })
})

describe('shown terminals', async () => {
  const { shownTerminals } = await import('../terminals')
  type Dev = Parameters<typeof shownTerminals>[0]
  const side = (d: Dev) => {
    const ts = shownTerminals(d)
    return `${ts.filter((x) => x.side === 'top').length}/${ts.filter((x) => x.side === 'bottom').length}`
  }
  it('draws entered terminals, else the standard set for pole-based types, else none', () => {
    expect(side({ id: 'Q', type: 'rcd', poles: 4, terminals: [] } as unknown as Dev)).toBe('4/4')
    expect(side({ id: 'Q', type: 'mcb', poles: 3, terminals: [] } as unknown as Dev)).toBe('3/3')
    expect(side({ id: 'S', type: 'ats', poles: 4, terminals: [] } as unknown as Dev)).toBe('8/4')
    expect(side({ id: 'X', type: 'other', poles: 1, terminals: [] } as unknown as Dev)).toBe('0/0')
    const own = [{ id: '1', side: 'top', role: 'in' }] as Dev['terminals']
    expect(side({ id: 'Q', type: 'mcb', poles: 3, terminals: own } as unknown as Dev)).toBe('1/0')
  })
})
