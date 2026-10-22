import type { PowerGraph } from './graph'
import { aggregateLoad, deviceLoad, pointsLoad } from './load'
import type { Device, PanelData } from './model'
import { RCD_TYPES, SMART_TYPES } from './model'
import { routeIssues } from './routing'

export type CheckLevel = 'error' | 'warn' | 'info'

export interface CheckResult {
  level: CheckLevel
  code: string
  device?: string
  point?: string
  params: Record<string, string | number>
}

// copper, concealed installation, PUE 7.1.34 / IEC 60364-5-52 rounded to standard breaker steps
const MAX_RATING_BY_SECTION: [section: number, nominal: number, tolerated: number][] = [
  [1, 6, 6],
  [1.5, 10, 13],
  [2.5, 16, 20],
  [4, 25, 25],
  [6, 32, 40],
  [10, 50, 50],
  [16, 63, 63],
  [25, 80, 80],
  [35, 100, 100],
]

export function maxRatingFor(section: number): { nominal: number; tolerated: number } | undefined {
  let best: { nominal: number; tolerated: number } | undefined
  for (const [s, nominal, tolerated] of MAX_RATING_BY_SECTION) if (section >= s) best = { nominal, tolerated }
  return best
}

const OVERCURRENT: readonly Device['type'][] = ['mcb', 'rcbo', 'afdd', 'fuse', 'neozed']
const INVERTER_PROFILES = new Set(['washer', 'dishwasher', 'cooktop', 'inverter-ac', 'ev'])
const LEVEL_ORDER: Record<CheckLevel, number> = { error: 0, warn: 1, info: 2 }

function nearestUpstream(g: PowerGraph, id: string, types: readonly Device['type'][]): Device | undefined {
  return g.ancestors(id).find((a) => types.includes(a.type))
}

export function runChecks(data: PanelData, g: PowerGraph): CheckResult[] {
  const out: CheckResult[] = []
  const voltage = data.supply.voltage
  const placed = new Set(data.rows.flatMap((r) => r.items.filter((i): i is string => typeof i === 'string')))

  for (const id of g.cycles) out.push({ level: 'error', code: 'cycle', device: id, params: {} })

  for (const d of data.devices) {
    const section = d.circuit?.crossSection
    const hasLoad = g.pointsOf(d.id, false).length > 0

    if (OVERCURRENT.includes(d.type) && d.rating && section) {
      const max = maxRatingFor(section)
      if (max && d.rating > max.tolerated)
        out.push({ level: 'error', code: 'cable-overload', device: d.id, params: { rating: d.rating, section, max: max.nominal } })
      else if (max && d.rating > max.nominal)
        out.push({ level: 'warn', code: 'cable-marginal', device: d.id, params: { rating: d.rating, section, max: max.nominal } })
    }
    if (OVERCURRENT.includes(d.type) && hasLoad && !section)
      out.push({ level: 'info', code: 'cable-unknown', device: d.id, params: {} })

    if (OVERCURRENT.includes(d.type) && d.rating) {
      const load = deviceLoad(g, d, voltage)
      if (load.utilization !== undefined && load.utilization > 1)
        out.push({ level: 'error', code: 'load-over', device: d.id, params: { current: round1(load.currentA), rating: d.rating } })
      else if (load.utilization !== undefined && load.utilization > 0.8)
        out.push({ level: 'warn', code: 'load-high', device: d.id, params: { current: round1(load.currentA), rating: d.rating } })

      const up = nearestUpstream(g, d.id, OVERCURRENT)
      if (up?.rating && d.rating > up.rating)
        out.push({ level: 'error', code: 'selectivity-over', device: d.id, params: { rating: d.rating, upstream: up.id, upRating: up.rating } })
      else if (up?.rating && d.rating === up.rating)
        out.push({ level: 'warn', code: 'selectivity-equal', device: d.id, params: { rating: d.rating, upstream: up.id } })
    }

    if (d.type === 'rcd' && d.rating) {
      const up = nearestUpstream(g, d.id, OVERCURRENT)
      if (up?.rating && d.rating < up.rating) {
        const downstreamSum = (g.children.get(d.id) ?? []).reduce((s, c) => s + (c.rating ?? 0), 0)
        if (downstreamSum > d.rating)
          out.push({ level: 'warn', code: 'rcd-underrated', device: d.id, params: { rating: d.rating, upstream: up.id, upRating: up.rating } })
      }
    }

    if (RCD_TYPES.includes(d.type) && d.leakage) {
      const upRcd = nearestUpstream(g, d.id, RCD_TYPES)
      if (upRcd?.leakage && !(upRcd.selective && upRcd.leakage >= d.leakage * 3))
        out.push({ level: 'warn', code: 'rcd-cascade', device: d.id, params: { upstream: upRcd.id, leakage: d.leakage, upLeakage: upRcd.leakage } })
    }

    if ((OVERCURRENT.includes(d.type) || d.type === 'rcd') && !d.rating)
      out.push({ level: 'info', code: 'rating-missing', device: d.id, params: {} })

    const isFinal = OVERCURRENT.includes(d.type) && !(g.children.get(d.id)?.length)
    if (isFinal && !hasLoad) out.push({ level: 'info', code: 'empty-circuit', device: d.id, params: {} })

    if (!placed.has(d.id) && d.type !== 'meter' && !d.location) out.push({ level: 'info', code: 'unplaced', device: d.id, params: {} })
  }

  const wetRooms = new Set(data.rooms.filter((r) => r.wet).map((r) => r.id))
  for (const p of data.points) {
    if (!p.device) {
      if (!['junction', 'switch', 'panel', 'sensor', 'data'].includes(p.kind)) out.push({ level: 'info', code: 'point-unassigned', point: p.id, params: {} })
      continue
    }
    const chain = g.rcdChain(p.device)
    // an RCD with no rating filled in is taken as the household 30 mA, not as missing protection
    const minLeak = Math.min(...chain.map((c) => c.leakage ?? 30))
    // panels and sensors sit on the SELV bus, switches carry no exposed live parts
    const selv = p.kind === 'switch' || p.kind === 'panel' || p.kind === 'sensor' || p.kind === 'data'
    if (p.room && wetRooms.has(p.room) && !selv && minLeak > 30)
      out.push({ level: 'error', code: 'wet-no-rcd', point: p.id, device: p.device, params: {} })
    else if (p.kind === 'socket' && minLeak > 30)
      out.push({ level: 'warn', code: 'socket-no-rcd', point: p.id, device: p.device, params: {} })

    if (p.profile && INVERTER_PROFILES.has(p.profile) && chain[0]?.rcdClass === 'AC')
      out.push({ level: 'warn', code: 'rcd-class', point: p.id, device: chain[0].id, params: { profile: p.profile } })
  }

  checkBus(data, out)

  for (const i of routeIssues(data))
    out.push({ level: 'warn', code: i.code, device: i.route.device, point: i.point?.id, params: { route: i.route.id } })

  const total = aggregateLoad(g, g.roots)
  if (data.supply.maxPowerKw) {
    const kw = total.demandW / 1000
    if (kw > data.supply.maxPowerKw)
      out.push({ level: 'warn', code: 'input-power', params: { kw: round1(kw), max: data.supply.maxPowerKw } })
  }

  if (data.supply.phases === 3) {
    const perPhase: Record<'L1' | 'L2' | 'L3', number> = { L1: 0, L2: 0, L3: 0 }
    for (const d of data.devices) {
      if (d.phase !== 'L1' && d.phase !== 'L2' && d.phase !== 'L3') continue
      perPhase[d.phase] += pointsLoad(g.pointsOf(d.id, false)).demandW
    }
    const vals = Object.values(perPhase)
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    if (max > 0 && (max - min) / max > 0.3)
      out.push({ level: 'warn', code: 'phase-imbalance', params: { L1: Math.round(perPhase.L1), L2: Math.round(perPhase.L2), L3: Math.round(perPhase.L3) } })
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

function checkBus(data: PanelData, out: CheckResult[]) {
  const smart = data.devices.filter((d) => d.smart || SMART_TYPES.includes(d.type))
  if (!smart.length) return
  const knx = smart.filter((d) => (d.smart?.system ?? 'knx') === 'knx')
  if (knx.length && !knx.some((d) => d.type === 'bus-psu')) out.push({ level: 'error', code: 'bus-no-psu', params: {} })

  const seen = new Map<string, string>()
  for (const d of smart) {
    const addr = d.smart?.address
    if (!addr) continue
    const key = `${d.smart?.system ?? 'knx'}:${addr}`
    const other = seen.get(key)
    if (other) out.push({ level: 'error', code: 'bus-dup-address', device: d.id, params: { address: addr, other } })
    else seen.set(key, d.id)
  }

  const pointById = new Map(data.points.map((p) => [p.id, p]))
  const groups = new Set<string>()
  for (const d of smart) {
    for (const ch of d.smart?.channels ?? []) {
      if (ch.group) groups.add(ch.group)
      if (!ch.points.length && ch.function !== 'input')
        out.push({ level: 'info', code: 'channel-unlinked', device: d.id, params: { channel: ch.id } })
      for (const pid of ch.points) {
        const p = pointById.get(pid)
        if (p && p.device !== d.id) out.push({ level: 'warn', code: 'channel-mismatch', device: d.id, point: pid, params: { channel: ch.id } })
      }
    }
  }
  for (const p of data.points) {
    for (const ga of p.controls) {
      if (!groups.has(ga)) out.push({ level: 'info', code: 'ga-unknown', point: p.id, params: { group: ga } })
    }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
