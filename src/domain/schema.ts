import { z } from 'zod'
import { APPLIANCE_PROFILES, BUS_SYSTEMS, CABLE_TYPES, CHANNEL_FUNCTIONS, DEVICE_TYPES, LOCALES, OPENING_KINDS, POINT_KINDS, ROUTE_KINDS, type ValidationIssue } from './model'

export const LocalizedText = z.union([z.string(), z.partialRecord(z.enum(LOCALES), z.string())])
export type LocalizedText = z.infer<typeof LocalizedText>

export const Channel = z.object({
  id: z.string(),
  label: LocalizedText.optional(),
  function: z.enum(CHANNEL_FUNCTIONS).default('switch'),
  // KNX group address like 1/2/3; other systems use whatever addressing they have
  group: z.string().optional(),
  points: z.array(z.string()).default([]),
})
export type Channel = z.infer<typeof Channel>

export const Smart = z.object({
  system: z.enum(BUS_SYSTEMS).default('knx'),
  // KNX physical address area.line.device, e.g. 1.1.5
  address: z.string().optional(),
  channels: z.array(Channel).default([]),
})
export type Smart = z.infer<typeof Smart>

export const Note = z.object({
  author: z.string().default(''),
  date: z.string(),
  text: z.string(),
})
export type Note = z.infer<typeof Note>

export const Circuit = z.object({
  cable: z.string().optional(),
  // mm², copper assumed
  crossSection: z.number().positive().optional(),
  lengthM: z.number().nonnegative().optional(),
  purpose: LocalizedText.optional(),
})
export type Circuit = z.infer<typeof Circuit>

export const Device = z.object({
  id: z.string().min(1),
  type: z.enum(DEVICE_TYPES),
  label: LocalizedText.default(''),
  // amperes
  rating: z.number().positive().optional(),
  curve: z.enum(['B', 'C', 'D', 'K', 'Z']).optional(),
  poles: z.number().int().min(1).max(4).default(1),
  // DIN modules of 17.5 mm; derived from type and poles when omitted
  width: z.number().positive().max(12).optional(),
  // milliamperes
  leakage: z.number().positive().optional(),
  rcdClass: z.enum(['AC', 'A', 'F', 'B']).optional(),
  selective: z.boolean().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  // utilities identify a meter by the number on its faceplate
  serial: z.string().optional(),
  // where to find a device that is not in this panel: a meter or breaker in the floor box on the landing
  location: LocalizedText.optional(),
  upstream: z.string().optional(),
  phase: z.enum(['L1', 'L2', 'L3', 'L1L2L3']).optional(),
  circuit: Circuit.optional(),
  tags: z.array(z.string()).default([]),
  notes: z.array(Note).default([]),
  photos: z.array(z.string()).default([]),
  smart: Smart.optional(),
  // reserved for a future live-data adapter (e.g. a Home Assistant entity id)
  entity: z.string().optional(),
})
export type Device = z.infer<typeof Device>

export const RowItem = z.union([z.string(), z.object({ blank: z.number().positive() })])
export type RowItem = z.infer<typeof RowItem>

export const Row = z.object({
  id: z.string(),
  modules: z.number().int().positive().max(48),
  items: z.array(RowItem).default([]),
})
export type Row = z.infer<typeof Row>

export const Point2 = z.tuple([z.number(), z.number()])
export type Point2 = z.infer<typeof Point2>

export const Room = z.object({
  id: z.string(),
  name: LocalizedText,
  wet: z.boolean().default(false),
  polygon: z.array(Point2).default([]),
  color: z.string().optional(),
  // centimetres; overrides plan.wallHeight for rooms with a dropped ceiling
  ceilingCm: z.number().positive().optional(),
})
export type Room = z.infer<typeof Room>

export const PlanPoint = z.object({
  id: z.string(),
  kind: z.enum(POINT_KINDS),
  room: z.string().optional(),
  x: z.number(),
  y: z.number(),
  device: z.string().optional(),
  label: LocalizedText.optional(),
  // watts, nameplate
  powerW: z.number().nonnegative().optional(),
  profile: z.enum(APPLIANCE_PROFILES).optional(),
  // millimetres from finished floor
  heightMm: z.number().nonnegative().optional(),
  // behind plaster, tiles or a stretch ceiling: reaching it means opening the finish
  concealed: z.boolean().optional(),
  // multiplies powerW: six spots of 7 W are count 6, a double socket is still one point
  count: z.number().int().positive().default(1),
  // group addresses a room control panel (or sensor) sends to
  controls: z.array(z.string()).default([]),
})
export type PlanPoint = z.infer<typeof PlanPoint>

export const Cable = z.object({
  type: z.enum(CABLE_TYPES),
  // what tells this cable apart at both ends, e.g. "router port 3" or "patch panel 12"
  label: z.string().optional(),
  count: z.number().int().positive().default(1),
})
export type Cable = z.infer<typeof Cable>

export const Route = z.object({
  id: z.string(),
  device: z.string().optional(),
  points: z.array(Point2).min(2),
  note: LocalizedText.optional(),
  // power and bus runs belong to a device; low-voltage runs and conduits carry `cables` instead
  kind: z.enum(ROUTE_KINDS).default('power'),
  cables: z.array(Cable).default([]),
  from: LocalizedText.optional(),
  to: LocalizedText.optional(),
  // conduit inner diameter, millimetres
  diameterMm: z.number().positive().optional(),
  // a draw wire left inside, so another cable can be pulled later
  pullString: z.boolean().optional(),
  // floor: in the screed; ceiling: just under the ceiling, whatever its height; wall: at `elevation`
  mount: z.enum(['floor', 'wall', 'ceiling']).optional(),
  // height of a wall run above the finished floor, centimetres
  elevation: z.number().nonnegative().optional(),
  // the strip around the route that must not be drilled, in plan units
  safeWidth: z.number().positive().default(15),
})
export type Route = z.infer<typeof Route>

export const Photo = z.object({
  id: z.string(),
  src: z.string(),
  room: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  caption: LocalizedText.optional(),
  date: z.string().optional(),
})
export type Photo = z.infer<typeof Photo>

export const MaintenanceTask = z.object({
  id: z.string(),
  title: LocalizedText,
  intervalDays: z.number().int().positive(),
  devices: z.array(z.string()).default([]),
  howTo: LocalizedText.optional(),
})
export type MaintenanceTask = z.infer<typeof MaintenanceTask>

export const MaintenanceLog = z.object({
  task: z.string(),
  date: z.string(),
  note: z.string().optional(),
  author: z.string().optional(),
})
export type MaintenanceLog = z.infer<typeof MaintenanceLog>

export const DocumentRef = z.object({
  id: z.string(),
  title: LocalizedText,
  kind: z.enum(['act', 'scheme', 'passport', 'warranty', 'invoice', 'other']).default('other'),
  href: z.string(),
  date: z.string().optional(),
})
export type DocumentRef = z.infer<typeof DocumentRef>

export const Contact = z.object({
  role: z.enum(['electrician', 'management', 'emergency', 'utility', 'other']),
  name: z.string(),
  phone: z.string().optional(),
  note: LocalizedText.optional(),
})
export type Contact = z.infer<typeof Contact>

export const Opening = z.object({
  id: z.string(),
  kind: z.enum(OPENING_KINDS),
  // centre of the opening, on the wall line
  x: z.number(),
  y: z.number(),
  // degrees, direction of the wall it sits in
  angle: z.number().default(0),
  // centimetres along the wall
  width: z.number().positive(),
  // a door swings to the left of the wall direction unless flipped
  flip: z.boolean().optional(),
})
export type Opening = z.infer<typeof Opening>

export const Plan = z.object({
  // plan units are centimetres: a 10 m wall is 1000 units
  width: z.number().positive().default(1200),
  height: z.number().positive().default(800),
  background: z.string().optional(),
  backgroundOpacity: z.number().min(0).max(1).default(0.6),
  grid: z.number().positive().default(50),
  // centimetres, used by the 3D view
  wallHeight: z.number().positive().default(270),
  openings: z.array(Opening).default([]),
})
export type Plan = z.infer<typeof Plan>

export const PanelData = z.object({
  meta: z.object({
    title: LocalizedText,
    address: z.string().optional(),
    updated: z.string().optional(),
    enclosure: z.string().optional(),
    location: LocalizedText.optional(),
    // where the web app is published, e.g. https://user.github.io/panel/app/ — QR codes point here
    publicUrl: z.string().optional(),
    // Home Assistant base URL, e.g. https://homeassistant.local:8123 — devices with an `entity` link to its history
    homeAssistantUrl: z.string().optional(),
    contacts: z.array(Contact).default([]),
  }),
  supply: z.object({
    phases: z.union([z.literal(1), z.literal(3)]).default(1),
    voltage: z.number().positive().default(230),
    // kilowatts allowed by the grid contract
    maxPowerKw: z.number().positive().optional(),
    input: z.string().optional(),
    // utility account number, asked for on every outage call
    account: z.string().optional(),
  }),
  rows: z.array(Row).default([]),
  devices: z.array(Device).default([]),
  rooms: z.array(Room).default([]),
  plan: Plan.default({ width: 1200, height: 800, backgroundOpacity: 0.6, grid: 50, wallHeight: 270, openings: [] }),
  points: z.array(PlanPoint).default([]),
  routes: z.array(Route).default([]),
  photos: z.array(Photo).default([]),
  maintenance: z
    .object({
      tasks: z.array(MaintenanceTask).default([]),
      log: z.array(MaintenanceLog).default([]),
    })
    .default({ tasks: [], log: [] }),
  documents: z.array(DocumentRef).default([]),
})
export type PanelData = z.infer<typeof PanelData>
export type PanelInput = z.input<typeof PanelData>

export function parsePanel(input: unknown): PanelData {
  return PanelData.parse(input)
}

export function safeParsePanel(input: unknown): { ok: true; data: PanelData } | { ok: false; issues: ValidationIssue[] } {
  const r = PanelData.safeParse(input)
  if (r.success) return { ok: true, data: r.data }
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  }
}

