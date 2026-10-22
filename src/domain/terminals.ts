// Terminals and the links between them. A link is stored on one end (`to: "<device>.<terminal>"`), so both ends are
// derived here; which device feeds which follows from the terminal roles (in ← out, bus is both).
import { CONDUCTORS, POSITION_OFF, resolveRef, type Device, type Terminal } from './model'

export { resolveRef }

export interface TerminalRef {
  device: Device
  terminal: Terminal
}

export const refKey = (device: string, terminal: string) => `${device}.${terminal}`

export interface TerminalIndex {
  // every link seen from both ends, keyed by refKey
  links: Map<string, TerminalRef[]>
  // device id → feed group → feeder ids, in terminal order
  feeds: Map<string, Map<string, string[]>>
}

export function buildTerminalIndex(devices: readonly Device[]): TerminalIndex {
  const links = new Map<string, TerminalRef[]>()
  const add = (a: TerminalRef, b: TerminalRef) => {
    const k = refKey(a.device.id, a.terminal.id)
    const list = links.get(k) ?? []
    list.push(b)
    links.set(k, list)
  }
  for (const d of devices)
    for (const t of d.terminals) {
      if (!t.to) continue
      const other = resolveRef(t.to, devices)
      if (!other) continue
      add({ device: d, terminal: t }, other)
      add(other, { device: d, terminal: t })
    }

  const feeds = new Map<string, Map<string, string[]>>()
  for (const d of devices) {
    const groups = new Map<string, string[]>()
    for (const t of d.terminals) {
      if (t.role === 'out') continue
      for (const o of links.get(refKey(d.id, t.id)) ?? []) {
        if (o.device.id === d.id) continue
        // ponytail: two bus terminals linked (block bridged to block) carry no direction, so they feed nothing
        const feeds = o.terminal.role === 'out' || (o.terminal.role === 'bus' && t.role === 'in')
        if (!feeds) continue
        const g = t.group ?? ''
        const list = groups.get(g) ?? []
        if (!list.includes(o.device.id)) list.push(o.device.id)
        groups.set(g, list)
      }
    }
    if (groups.size) feeds.set(d.id, groups)
  }
  return { links, feeds }
}

// every device that feeds the live group: a 3-phase device can take each phase from a different one, and it is only
// powered while all of them are. Without links it is the hand-set upstream.
export function liveFeeders(d: Device, idx: TerminalIndex): string[] {
  const groups = idx.feeds.get(d.id)
  if (!groups) return d.upstream ? [d.upstream] : []
  // a position naming a known group is taken literally: a group with no linked source leaves the device as a root
  // (its source, e.g. a backup inverter, is outside this panel), it never falls back to another group
  if (d.position && d.position !== POSITION_OFF && feedGroups(d).includes(d.position)) return groups.get(d.position) ?? []
  return groups.values().next().value ?? []
}

// the feeder the tree hangs a device under: the first of the live feeders. The tree stays a tree for the diagram;
// power checks use all live feeders (graph.isFed).
export function effectiveUpstream(d: Device, idx: TerminalIndex): string | undefined {
  return liveFeeders(d, idx)[0]
}

export const isOpen = (d: Device) => d.position === POSITION_OFF

export function feedGroups(d: Device): string[] {
  return [...new Set(d.terminals.filter((t) => t.role !== 'out' && t.group).map((t) => t.group!))]
}

function conductorsFor(d: Device): (Terminal['conductor'] | undefined)[] {
  const single = d.phase && d.phase !== 'L1L2L3' ? d.phase : undefined
  switch (d.poles) {
    case 1:
      return [single]
    case 2:
      return [single, 'N']
    case 3:
      return ['L1', 'L2', 'L3']
    default:
      return [...CONDUCTORS.slice(0, 3), 'N']
  }
}

// devices whose terminals follow their poles closely enough to draw them without a list
const POLE_LAYOUT_TYPES: readonly Device['type'][] = ['mcb', 'rcd', 'rcbo', 'afdd', 'switch', 'fuse', 'meter', 'contactor', 'ats']

// what the panel draws: the entered terminals, else the standard set for pole-based types, else nothing (one screw
// per module then)
export function shownTerminals(d: Device): Terminal[] {
  if (d.terminals.length) return d.terminals
  return POLE_LAYOUT_TYPES.includes(d.type) ? defaultTerminals(d) : []
}

// terminal layout as most DIN devices print it: odd numbers on the supply side, even on the load side
export function defaultTerminals(d: Device): Terminal[] {
  if (d.type === 'terminal' || d.type === 'bus') {
    return Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), side: 'top', role: 'bus' }))
  }
  if (d.type === 'distribution-block') {
    return Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), side: i < 3 ? 'top' : 'bottom', role: 'bus' }))
  }
  const cond = conductorsFor(d)
  // undefined keys would reach the YAML export, which cannot dump them
  const opt = (c: Terminal['conductor'] | undefined, group?: string) => ({ ...(c ? { conductor: c } : {}), ...(group ? { group } : {}) })
  const pair = (prefix: string, group?: string): Terminal[] =>
    cond.map((c, i) => ({ id: `${prefix}${2 * i + 1}`, side: 'top', role: 'in', ...opt(c, group) }))
  const outs = cond.map((c, i): Terminal => ({ id: String(2 * i + 2), side: 'bottom', role: 'out', ...opt(c) }))
  if (d.type === 'ats') return [...pair('I.', 'I'), ...pair('II.', 'II'), ...outs]
  return [...pair(''), ...outs]
}
