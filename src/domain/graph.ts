import type { Device, PanelData, PlanPoint } from './model'
import { RCD_TYPES } from './model'
import { buildTerminalIndex, effectiveUpstream, isOpen, liveFeeders, type TerminalIndex } from './terminals'

export interface PowerGraph {
  byId: Map<string, Device>
  children: Map<string, Device[]>
  roots: Device[]
  cycles: string[]
  ancestors(id: string): Device[]
  descendants(id: string): Device[]
  pointsOf(id: string, deep?: boolean): PlanPoint[]
  isPowered(id: string, off: ReadonlySet<string>): boolean
  // whether the device's own input is live: a switched-off breaker still has voltage on its supply side
  isFed(id: string, off: ReadonlySet<string>): boolean
  rcdChain(id: string): Device[]
  depth(id: string): number
  // the feeder the tree uses: from terminal links when they name one, else the hand-set upstream
  upstreamOf(id: string): string | undefined
  // all devices feeding the live group, the tree parent first
  feedersOf(id: string): string[]
  terminals: TerminalIndex
}

export function buildGraph(data: Pick<PanelData, 'devices' | 'points'>): PowerGraph {
  const byId = new Map(data.devices.map((d) => [d.id, d]))
  const terminals = buildTerminalIndex(data.devices)
  const upOf = new Map(data.devices.map((d) => [d.id, effectiveUpstream(d, terminals)]))
  const up = (d: Device) => upOf.get(d.id)
  const feederMap = new Map(data.devices.map((d) => [d.id, liveFeeders(d, terminals).filter((f) => f !== d.id)]))
  const feeders = (id: string) => feederMap.get(id) ?? []
  const children = new Map<string, Device[]>()
  const roots: Device[] = []
  for (const d of data.devices) {
    const u = up(d)
    if (u && byId.has(u)) {
      const list = children.get(u) ?? []
      list.push(d)
      children.set(u, list)
    } else {
      roots.push(d)
    }
  }

  const cycles: string[] = []
  for (const d of data.devices) {
    const seen = new Set<string>([d.id])
    let cur = up(d) ? byId.get(up(d)!) : undefined
    while (cur) {
      if (seen.has(cur.id)) {
        cycles.push(d.id)
        break
      }
      seen.add(cur.id)
      cur = up(cur) ? byId.get(up(cur)!) : undefined
    }
  }
  const cyclic = new Set(cycles)

  const pointsByDevice = new Map<string, PlanPoint[]>()
  for (const p of data.points) {
    if (!p.device) continue
    const list = pointsByDevice.get(p.device) ?? []
    list.push(p)
    pointsByDevice.set(p.device, list)
  }

  function ancestors(id: string): Device[] {
    const out: Device[] = []
    if (cyclic.has(id)) return out
    let cur = byId.get(id)
    while (cur && up(cur)) {
      const parent = byId.get(up(cur)!)
      if (!parent) break
      out.push(parent)
      cur = parent
    }
    return out
  }

  function descendants(id: string): Device[] {
    const out: Device[] = []
    const seen = new Set<string>([id])
    const stack = [...(children.get(id) ?? [])]
    while (stack.length) {
      const d = stack.pop()!
      if (seen.has(d.id)) continue
      seen.add(d.id)
      out.push(d)
      stack.push(...(children.get(d.id) ?? []))
    }
    return out
  }

  function pointsOf(id: string, deep = true): PlanPoint[] {
    const own = pointsByDevice.get(id) ?? []
    if (!deep) return own
    return [own, ...descendants(id).map((d) => pointsByDevice.get(d.id) ?? [])].flat()
  }

  function isFed(id: string, off: ReadonlySet<string>): boolean {
    // fed when every live feeder is on, closed and fed itself; a changeover switch in position 0 is off by itself.
    // Walks all feeders, not just the tree parent, so one phase block switched off shows up.
    // an unknown feeder stands for a supply outside the panel and a loop stops the walk, both as before (the reference
    // check and the cycle check report them). ponytail: no memo, fine for panel-sized graphs.
    const walk = (cur: string, seen: Set<string>): boolean =>
      feeders(cur).every((f) => {
        const fd = byId.get(f)
        if (!fd || seen.has(f)) return true
        return !off.has(f) && !isOpen(fd) && walk(f, new Set(seen).add(f))
      })
    return walk(id, new Set([id]))
  }

  function isPowered(id: string, off: ReadonlySet<string>): boolean {
    const self = byId.get(id)
    return !off.has(id) && !(self && isOpen(self)) && isFed(id, off)
  }

  function rcdChain(id: string): Device[] {
    const self = byId.get(id)
    return [self, ...ancestors(id)].filter((d): d is Device => !!d && RCD_TYPES.includes(d.type))
  }

  function depth(id: string): number {
    return ancestors(id).length
  }

  return { byId, children, roots, cycles, ancestors, descendants, pointsOf, isFed, isPowered, rcdChain, depth, upstreamOf: (id) => upOf.get(id), feedersOf: feeders, terminals }
}

export function pointPowered(g: PowerGraph, p: PlanPoint, off: ReadonlySet<string>): boolean {
  if (!p.device) return true
  return g.isPowered(p.device, off)
}
