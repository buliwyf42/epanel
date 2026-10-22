// Plain data model: constants, types and helpers with no runtime dependency on zod.
// The zod schemas live in ./schema and load only when a file is actually parsed.
import type { Device, LocalizedText, PanelData, Route, Terminal } from './schema'

export type { LocalizedText, Channel, Smart, Note, Circuit, Terminal, Device, RowItem, Row, Point2, Room, PlanPoint, Cable, Route, Photo, MaintenanceTask, MaintenanceLog, DocumentRef, Contact, Opening, Plan, PanelData, PanelInput } from './schema'

export const LOCALES = ['ru', 'en', 'sr', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const DEVICE_TYPES = [
  'mcb',
  'rcd',
  'rcbo',
  'voltage-relay',
  'spd',
  'meter',
  'switch',
  'contactor',
  'din-socket',
  'afdd',
  'fuse',
  'time-relay',
  'impulse-relay',
  'dimmer',
  'psu',
  'ats',
  'ups',
  'bus',
  'terminal',
  'distribution-block',
  'actuator',
  'bus-psu',
  'bus-gateway',
  'bus-io',
  'other',
] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export const RCD_TYPES: readonly DeviceType[] = ['rcd', 'rcbo']
// devices that physically break the circuit and are safe to rely on before touching wires;
// bus actuators and contactors are software-driven relays and never count as isolation
export const ISOLATING_TYPES: readonly DeviceType[] = ['mcb', 'rcd', 'rcbo', 'switch', 'afdd', 'fuse']
export const SMART_TYPES: readonly DeviceType[] = ['actuator', 'bus-psu', 'bus-gateway', 'bus-io']

// a terminal's role decides which way power flows over a link: in ← out; a bus terminal (terminal block, busbar) is both
export const TERMINAL_ROLES = ['in', 'out', 'bus'] as const
export type TerminalRole = (typeof TERMINAL_ROLES)[number]
export const CONDUCTORS = ['L1', 'L2', 'L3', 'N', 'PE'] as const
// position of a changeover switch that feeds nothing
export const POSITION_OFF = '0'

// terminal block housings as sold; the svg ids are gradients/patterns from PanelDefs
export const BLOCK_COLORS: Record<string, string> = {
  brown: '#7a4a2a',
  black: '#2b2b2b',
  grey: '#8f8f8f',
  blue: 'url(#n-base)',
  'green-yellow': 'url(#pe-base)',
  red: '#b91c1c',
  white: '#e8e8e2',
}
// IEC 60445 conductor colours
const CONDUCTOR_COLOR: Record<string, string> = { L1: 'brown', L2: 'black', L3: 'grey', N: 'blue', PE: 'green-yellow' }

// the colour name a terminal block shows: set by hand, else the one conductor all its terminals share
export function blockColor(d: Pick<Device, 'color' | 'terminals'>): string | undefined {
  if (d.color) return d.color
  const cs = new Set(d.terminals.map((t) => t.conductor).filter(Boolean))
  return cs.size === 1 ? CONDUCTOR_COLOR[[...cs][0]!] : undefined
}

export const BUS_SYSTEMS =['knx', 'dali', 'modbus', 'zigbee', 'zwave', 'matter', 'wirenboard', 'other'] as const
export const CHANNEL_FUNCTIONS = ['switch', 'dimmer', 'blind', 'heating', 'hvac', 'input', 'other'] as const

export const OPENING_KINDS = ['door', 'window'] as const
export type OpeningKind = (typeof OPENING_KINDS)[number]

export const POINT_KINDS = [
  'socket',
  'light',
  'switch',
  'appliance',
  'heating',
  'ac',
  'junction',
  'network',
  'data',
  'panel',
  'sensor',
  'other',
] as const
export type PointKind = (typeof POINT_KINDS)[number]

export const APPLIANCE_PROFILES = [
  'generic',
  'washer',
  'dishwasher',
  'oven',
  'cooktop',
  'fridge',
  'boiler',
  'inverter-ac',
  'floor-heating',
  'ev',
] as const
export type ApplianceProfile = (typeof APPLIANCE_PROFILES)[number]

export const ROUTE_KINDS = ['power', 'bus', 'low', 'conduit'] as const
export type RouteKind = (typeof ROUTE_KINDS)[number]
export const CABLE_TYPES = ['ethernet', 'hdmi', 'coax', 'usb', 'speaker', 'fiber', 'phone', 'alarm', 'other'] as const
export type CableType = (typeof CABLE_TYPES)[number]

export function tr(text: LocalizedText | undefined, locale: string, fallback = ''): string {
  if (text === undefined) return fallback
  if (typeof text === 'string') return text
  const t = text as Partial<Record<string, string>>
  return t[locale] ?? t.en ?? t.ru ?? Object.values(t).find(Boolean) ?? fallback
}

export function defaultWidth(d: Pick<Device, 'type' | 'poles' | 'width'>): number {
  if (d.width) return d.width
  switch (d.type) {
    case 'meter':
      return d.poles >= 3 ? 7 : 4
    case 'din-socket':
      return 3
    case 'voltage-relay':
      return d.poles >= 3 ? 4 : 2
    case 'bus':
      return 4
    case 'actuator':
      return d.poles >= 3 ? 4 : d.poles >= 2 ? 4 : 2
    case 'bus-psu':
      return 4
    case 'bus-gateway':
      return 2
    case 'bus-io':
      return 2
    case 'rcd':
      return d.poles >= 3 ? 4 : 2
    case 'rcbo':
      return d.poles >= 3 ? 4 : 2
    case 'afdd':
      return 2
    case 'time-relay':
    case 'dimmer':
      return 2
    case 'psu':
    case 'ats':
    case 'ups':
      return 4
    default:
      return d.poles
  }
}

export type ValidationIssue = { path: string; message: string }

// referential integrity is outside zod's reach, so it is checked separately
// "<device>.<terminal>": device and terminal ids may both contain dots, so the longest device id that prefixes the ref wins
export function resolveRef(ref: string, devices: readonly Device[]): { device: Device; terminal: Terminal } | undefined {
  let best: Device | undefined
  for (const d of devices) if (ref.startsWith(`${d.id}.`) && (!best || d.id.length > best.id.length)) best = d
  if (!best) return undefined
  const tid = ref.slice(best.id.length + 1)
  const terminal = best.terminals.find((t) => t.id === tid)
  return terminal ? { device: best, terminal } : undefined
}

export function referenceIssues(d: PanelData): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  d.devices.forEach((dev, i) => {
    if (ids.has(dev.id)) issues.push({ path: `devices.${i}.id`, message: `duplicate id ${dev.id}` })
    ids.add(dev.id)
  })
  const roomIds = new Set(d.rooms.map((r) => r.id))
  d.devices.forEach((dev, i) => {
    if (dev.upstream && !ids.has(dev.upstream))
      issues.push({ path: `devices.${i}.upstream`, message: `unknown device ${dev.upstream}` })
  })
  d.devices.forEach((dev, i) => {
    const seen = new Set<string>()
    dev.terminals.forEach((t, ti) => {
      if (seen.has(t.id)) issues.push({ path: `devices.${i}.terminals.${ti}.id`, message: `duplicate terminal ${dev.id}.${t.id}` })
      seen.add(t.id)
      if (t.to && !resolveRef(t.to, d.devices))
        issues.push({ path: `devices.${i}.terminals.${ti}.to`, message: `unknown terminal ${t.to}` })
    })
  })
  d.rows.forEach((row, ri) =>
    row.items.forEach((it, ii) => {
      if (typeof it === 'string' && !ids.has(it))
        issues.push({ path: `rows.${ri}.items.${ii}`, message: `unknown device ${it}` })
    }),
  )
  d.points.forEach((p, i) => {
    if (p.device && !ids.has(p.device))
      issues.push({ path: `points.${i}.device`, message: `unknown device ${p.device}` })
    if (p.room && !roomIds.has(p.room)) issues.push({ path: `points.${i}.room`, message: `unknown room ${p.room}` })
  })
  d.routes.forEach((r, i) => {
    if (r.device && !ids.has(r.device)) issues.push({ path: `routes.${i}.device`, message: `unknown device ${r.device}` })
  })
  const pointIds = new Set(d.points.map((p) => p.id))
  d.devices.forEach((dev, i) =>
    dev.smart?.channels.forEach((ch, ci) =>
      ch.points.forEach((pid) => {
        if (!pointIds.has(pid)) issues.push({ path: `devices.${i}.smart.channels.${ci}`, message: `unknown point ${pid}` })
      }),
    ),
  )
  d.photos.forEach((p, i) => {
    if (p.room && !roomIds.has(p.room)) issues.push({ path: `photos.${i}.room`, message: `unknown room ${p.room}` })
  })
  return issues
}

const MOUNT_DEFAULT: Record<Route['kind'], 'floor' | 'wall' | 'ceiling'> = { power: 'wall', bus: 'wall', low: 'floor', conduit: 'floor' }

// an explicit elevation without a mount means a wall run at that height
export function routeMount(r: Route): 'floor' | 'wall' | 'ceiling' {
  return r.mount ?? (r.elevation !== undefined ? 'wall' : MOUNT_DEFAULT[r.kind])
}

// centimetres above the floor where a run actually sits
export function routeHeight(r: Route, ceilingCm: number): number {
  const mount = routeMount(r)
  if (mount === 'floor') return 4
  if (mount === 'ceiling') return Math.max(0, ceilingCm - 6)
  return r.elevation ?? 30
}

export const ASSET_PREFIX = 'asset:'

export interface Bundle {
  format: 'panel-bundle'
  version: 1
  data: PanelData
  // id → data URL; referenced from data as "asset:<id>" so the plaintext never leaves the encrypted bundle
  assets: Record<string, string>
}

export function resolveAsset(src: string | undefined, assets: Record<string, string>): string | undefined {
  if (!src) return undefined
  if (src.startsWith(ASSET_PREFIX)) return assets[src.slice(ASSET_PREFIX.length)]
  return src
}

function usedAssetIds(data: PanelData): Set<string> {
  const ids = new Set<string>()
  const add = (s?: string) => {
    if (s?.startsWith(ASSET_PREFIX)) ids.add(s.slice(ASSET_PREFIX.length))
  }
  add(data.plan.background)
  data.photos.forEach((p) => add(p.src))
  data.documents.forEach((d) => add(d.href))
  data.devices.forEach((d) => d.photos.forEach(add))
  return ids
}

export function pruneAssets(b: Bundle): Bundle {
  const used = usedAssetIds(b.data)
  return { ...b, assets: Object.fromEntries(Object.entries(b.assets).filter(([k]) => used.has(k))) }
}
