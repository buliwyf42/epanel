import { defaultWidth, resolveRef, type Device, type DeviceType, type PanelData, type RowItem } from '@/domain/model'

const ID_PREFIX: Record<DeviceType, string> = {
  mcb: 'QF',
  rcd: 'QD',
  rcbo: 'QFD',
  'voltage-relay': 'KV',
  spd: 'FV',
  meter: 'PM',
  switch: 'QS',
  contactor: 'KM',
  'din-socket': 'XS',
  afdd: 'QFA',
  fuse: 'FU',
  'time-relay': 'KT',
  'impulse-relay': 'KL',
  dimmer: 'UD',
  psu: 'G',
  ats: 'QAT',
  ups: 'GU',
  bus: 'X',
  terminal: 'XT',
  actuator: 'QA',
  'bus-psu': 'GB',
  'bus-gateway': 'KF',
  'bus-io': 'KI',
  other: 'A',
}

const DEVICE_DEFAULTS: Record<DeviceType, Partial<Device>> = {
  mcb: { rating: 16, curve: 'C', poles: 1 },
  rcd: { rating: 40, leakage: 30, rcdClass: 'A', poles: 2 },
  rcbo: { rating: 16, curve: 'C', leakage: 30, rcdClass: 'A', poles: 2 },
  'voltage-relay': { rating: 63, poles: 2 },
  spd: { poles: 2 },
  meter: { poles: 2 },
  switch: { rating: 63, poles: 2 },
  contactor: { rating: 25, poles: 2 },
  'din-socket': { rating: 16, poles: 1 },
  afdd: { rating: 16, curve: 'C', poles: 2 },
  fuse: { rating: 16, poles: 1 },
  'time-relay': { rating: 16, poles: 1 },
  'impulse-relay': { rating: 16, poles: 1 },
  dimmer: { poles: 1 },
  psu: { poles: 1 },
  ats: { rating: 63, poles: 2 },
  ups: { poles: 1 },
  bus: { poles: 1 },
  terminal: { poles: 1, width: 1 },
  actuator: { poles: 2, smart: { system: 'knx', channels: ['A', 'B', 'C', 'D'].map((id) => ({ id, function: 'switch' as const, points: [] })) } },
  'bus-psu': { poles: 1, smart: { system: 'knx', channels: [] } },
  'bus-gateway': { poles: 1, smart: { system: 'knx', channels: [] } },
  'bus-io': { poles: 1, smart: { system: 'knx', channels: [] } },
  other: { poles: 1 },
}

export function newDeviceWidth(type: DeviceType): number {
  const def = DEVICE_DEFAULTS[type]
  return defaultWidth({ type, poles: def.poles ?? 1, width: def.width })
}

export function nextDeviceId(d: PanelData, type: DeviceType): string {
  const prefix = ID_PREFIX[type]
  const used = new Set(d.devices.map((x) => x.id))
  // QF0 is conventionally the main breaker, so numbering of new ones starts at 1
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

export function addDevice(d: PanelData, type: DeviceType, rowIndex: number, at?: number): Device {
  const dev: Device = {
    id: nextDeviceId(d, type),
    type,
    label: '',
    poles: 1,
    terminals: [],
    tags: [],
    notes: [],
    photos: [],
    ...structuredClone(DEVICE_DEFAULTS[type]),
  }
  d.devices.push(dev)
  const row = d.rows[rowIndex]
  if (row) {
    if (at === undefined) row.items.push(dev.id)
    else row.items.splice(at, 0, dev.id)
  }
  return dev
}

// renames one terminal and rewrites every link that points at it; refuses an empty or taken id
export function renameTerminal(d: PanelData, deviceId: string, from: string, to: string): boolean {
  const dev = d.devices.find((x) => x.id === deviceId)
  const t = dev?.terminals.find((x) => x.id === from)
  to = to.trim()
  if (!dev || !t || !to || to === from || dev.terminals.some((x) => x.id === to)) return false
  t.id = to
  const oldRef = `${deviceId}.${from}`
  for (const x of d.devices) for (const tt of x.terminals) if (tt.to === oldRef) tt.to = `${deviceId}.${to}`
  return true
}

export function removeDevice(d: PanelData, id: string) {
  const dev = d.devices.find((x) => x.id === id)
  d.devices = d.devices.filter((x) => x.id !== id)
  for (const row of d.rows) row.items = row.items.filter((i) => i !== id)
  // children are re-attached to the removed device's feeder so the tree stays connected
  for (const x of d.devices) if (x.upstream === id) x.upstream = dev?.upstream
  // links into the removed device would dangle; the other end keeps its terminal, just unlinked
  for (const x of d.devices) for (const t of x.terminals) if (t.to?.startsWith(`${id}.`) && !resolveRef(t.to, d.devices)) t.to = undefined
  for (const p of d.points) if (p.device === id) p.device = undefined
  for (const r of d.routes) if (r.device === id) r.device = undefined
  for (const t of d.maintenance.tasks) t.devices = t.devices.filter((x) => x !== id)
  if (d.supply.input === id) d.supply.input = undefined
}

export function renameDevice(d: PanelData, from: string, to: string): boolean {
  to = to.trim()
  if (!to || from === to || d.devices.some((x) => x.id === to)) return false
  const dev = d.devices.find((x) => x.id === from)
  if (!dev) return false
  dev.id = to
  for (const row of d.rows) row.items = row.items.map((i) => (i === from ? to : i))
  for (const x of d.devices) if (x.upstream === from) x.upstream = to
  for (const x of d.devices) for (const t of x.terminals) if (t.to?.startsWith(`${from}.`)) t.to = `${to}${t.to.slice(from.length)}`
  for (const p of d.points) if (p.device === from) p.device = to
  for (const r of d.routes) if (r.device === from) r.device = to
  for (const t of d.maintenance.tasks) t.devices = t.devices.map((x) => (x === from ? to : x))
  if (d.supply.input === from) d.supply.input = to
  return true
}

export function findItem(d: PanelData, id: string): { row: number; index: number } | undefined {
  for (let r = 0; r < d.rows.length; r++) {
    const i = d.rows[r]!.items.indexOf(id)
    if (i >= 0) return { row: r, index: i }
  }
  return undefined
}

export function moveItem(d: PanelData, row: number, index: number, delta: number) {
  const items = d.rows[row]?.items
  if (!items) return
  const j = index + delta
  if (j < 0 || j >= items.length) return
  const [it] = items.splice(index, 1)
  items.splice(j, 0, it as RowItem)
}

export function moveToRow(d: PanelData, id: string, targetRow: number) {
  const loc = findItem(d, id)
  if (!d.rows[targetRow]) return
  if (loc) d.rows[loc.row]!.items.splice(loc.index, 1)
  d.rows[targetRow]!.items.push(id)
}

/**
 * Puts a device into a row at `index` of row.items. When that index holds a blank, the device
 * takes its place and the blank shrinks by the device width, the way a cover strip is cut back.
 */
export function placeAt(d: PanelData, id: string, row: number, index: number) {
  const items = d.rows[row]?.items
  if (!items) return
  const at = items[index]
  const dev = d.devices.find((x) => x.id === id)
  if (at && typeof at !== 'string' && dev) {
    const left = at.blank - defaultWidth(dev)
    if (left > 0) at.blank = left
    else items.splice(index, 1)
  }
  items.splice(index, 0, id)
}

/** Returns the feeder a device placed at `index` most likely hangs off: the RCD to its left, or that neighbour's own feeder. */
export function feederAt(d: PanelData, row: number, index: number): string | undefined {
  const items = d.rows[row]?.items ?? []
  for (let i = index - 1; i >= 0; i--) {
    const it = items[i]
    if (typeof it !== 'string') continue
    const dev = d.devices.find((x) => x.id === it)
    if (!dev) continue
    return dev.type === 'rcd' ? dev.id : dev.upstream
  }
  return undefined
}

export function insertBlank(d: PanelData, row: number, index: number, width = 1) {
  d.rows[row]?.items.splice(index, 0, { blank: width })
}

export function addRow(d: PanelData, modules = 18) {
  const used = new Set(d.rows.map((r) => r.id))
  let n = d.rows.length + 1
  while (used.has(`r${n}`)) n++
  d.rows.push({ id: `r${n}`, modules, items: [] })
}

export function removeRow(d: PanelData, index: number) {
  d.rows.splice(index, 1)
}

export function removeRoom(d: PanelData, id: string) {
  d.rooms = d.rooms.filter((r) => r.id !== id)
  for (const p of d.points) if (p.room === id) p.room = undefined
  for (const p of d.photos) if (p.room === id) p.room = undefined
}

export function removePoint(d: PanelData, id: string) {
  d.points = d.points.filter((p) => p.id !== id)
  for (const dev of d.devices) for (const ch of dev.smart?.channels ?? []) ch.points = ch.points.filter((x) => x !== id)
}

export function uniqueId(existing: Iterable<string>, prefix: string): string {
  const used = new Set(existing)
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}
