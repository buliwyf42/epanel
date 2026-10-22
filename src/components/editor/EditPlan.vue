<script setup lang="ts">
import { isoDay } from '@/domain/maintenance'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { Camera, Check, ChevronLeft, DoorOpen, ImagePlus, Magnet, MousePointer2, Pentagon, Plug, Spline, Square, Trash2, Undo2, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { POINT_COLORS, POINT_ICONS } from '@/components/common/kinds'
import FloorPlan from '@/components/plan/FloorPlan.vue'
import { ASSET_PREFIX } from '@/domain/model'
import { pointInPolygon, snap as snapTo } from '@/domain/geometry'
import { APPLIANCE_PROFILES, CABLE_TYPES, OPENING_KINDS, POINT_KINDS, ROUTE_KINDS, routeMount, type OpeningKind, type Point2, type PointKind, type RouteKind } from '@/domain/model'
import { removePoint, removeRoom, uniqueId } from '@/editor/ops'
import { orthogonal, parseTypedLength, placeOnWall, snapToGeometry, wallAt } from '@/editor/snap'
import { compressImage, newId, planImageFrom } from '@/lib/media'
import { useDraft } from '@/composables/useDraft'
import { useText } from '@/composables/useText'
import { openBinaryFiles } from '@/platform'
import FormRow from './FormRow.vue'
import LocalizedInput from './LocalizedInput.vue'
import NumberInput from './NumberInput.vue'

type Mode = 'select' | 'rect' | 'room' | 'opening' | 'point' | 'route' | 'photo'
type Sel = { kind: 'point' | 'room' | 'opening' | 'route' | 'photo'; id: string } | null

const { d, assets, data } = useDraft()
const { t, tx } = useText()
const mode = ref<Mode>('select')
const sel = ref<Sel>(null)
const snapOn = ref(true)
const pending = ref<Point2[]>([])
const cursor = ref<Point2 | null>(null)
const Plan3D = defineAsyncComponent(() => import('@/components/plan/Plan3D.vue'))
// 3D is for checking heights and runs; drawing stays in 2D where clicks map to plan coordinates
const view3d = ref(false)
function toggle3d() {
  setMode('select')
  view3d.value = !view3d.value
}
const newKind = ref<PointKind>('socket')
const newDevice = ref<string>('__')
const newRouteKind = ref<RouteKind>('power')
const newOpening = ref<OpeningKind>('door')
// typical clear widths: an interior door leaf, a two-sash window
const OPENING_WIDTH: Record<OpeningKind, number> = { door: 80, window: 120 }
const busy = ref(false)
const plan = ref<InstanceType<typeof FloorPlan> | null>(null)

const MODES: { id: Mode; icon: typeof Plug }[] = [
  { id: 'select', icon: MousePointer2 },
  { id: 'rect', icon: Square },
  { id: 'room', icon: Pentagon },
  { id: 'opening', icon: DoorOpen },
  { id: 'point', icon: Plug },
  { id: 'route', icon: Spline },
  { id: 'photo', icon: Camera },
]

function sn(v: number) {
  return snapOn.value ? snapTo(v, d.value.plan.grid / 5) : Math.round(v)
}

// walls and cables both run at right angles, so a new vertex lines up with the previous one; Alt frees the angle
const freeAngle = ref(false)
// a fixed share of the visible plan, so snapping feels the same at any zoom
const snapTolerance = computed(() => d.value.plan.width / 60 / Math.max(1, plan.value?.pz.scale.value ?? 1))
// sockets and switches sit on walls; a click this close to one lands on it
const WALL_REACH = 40

function place(x: number, y: number): Point2 {
  const anchors = mode.value === 'route' ? d.value.points.map((p): Point2 => [p.x, p.y]) : []
  let p: Point2 = snapOn.value ? (snapToGeometry([x, y], d.value.rooms, snapTolerance.value, anchors) ?? [sn(x), sn(y)]) : [Math.round(x), Math.round(y)]
  const prev = pending.value.at(-1)
  if ((mode.value === 'route' || mode.value === 'room') && prev && !freeAngle.value) p = orthogonal(prev, p)
  if (mode.value === 'point' && snapOn.value) p = placeOnWall(p, d.value.rooms, WALL_REACH)
  return p
}

const typed = ref('')

function rectFrom(a: Point2, b: Point2): Point2[] {
  return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]
}

function addRoom(polygon: Point2[]) {
  const id = uniqueId(
    d.value.rooms.map((r) => r.id),
    'room-',
  )
  // fresh tuples: `pending` holds reactive proxies, and one left in the draft breaks structuredClone on autosave
  d.value.rooms.push({ id, name: t('editor.plan.roomN', { n: d.value.rooms.length + 1 }), wet: false, polygon: polygon.map(([x, y]) => [x, y]) })
  sel.value = { kind: 'room', id }
  pending.value = []
  mode.value = 'select'
}

// a typed length goes in the direction the cursor points, so "3.5 Enter" draws a 3.5 m wall
function applyTyped() {
  const len = parseTypedLength(typed.value)
  const start = pending.value.at(-1)
  typed.value = ''
  if (!len || !start) return
  const c = cursor.value ?? [start[0] + 1, start[1]]
  if (mode.value === 'rect') {
    const sx = c[0] >= start[0] ? 1 : -1
    const sy = c[1] >= start[1] ? 1 : -1
    return addRoom(rectFrom(start, [start[0] + sx * len.a, start[1] + sy * (len.b ?? len.a)]))
  }
  let dx = c[0] - start[0]
  let dy = c[1] - start[1]
  if (!freeAngle.value) [dx, dy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy)]
  const n = Math.hypot(dx, dy) || 1
  pending.value.push([Math.round(start[0] + (dx / n) * len.a), Math.round(start[1] + (dy / n) * len.a)])
}

const point = computed(() => (sel.value?.kind === 'point' ? d.value.points.find((p) => p.id === sel.value!.id) : undefined))
const room = computed(() => (sel.value?.kind === 'room' ? d.value.rooms.find((p) => p.id === sel.value!.id) : undefined))
const route = computed(() => (sel.value?.kind === 'route' ? d.value.routes.find((p) => p.id === sel.value!.id) : undefined))
// width/depth fields only make sense for an axis-aligned rectangle; other shapes are edited by dragging corners
const roomBox = computed(() => {
  const p = room.value?.polygon
  if (p?.length !== 4) return null
  const xs = new Set(p.map((v) => v[0]))
  const ys = new Set(p.map((v) => v[1]))
  if (xs.size !== 2 || ys.size !== 2) return null
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  return { x0, y0, w: x1 - x0, h: y1 - y0 }
})

function resizeRoom(axis: 0 | 1, size: number | undefined) {
  const box = roomBox.value
  if (!box || !room.value || !size) return
  const origin = axis === 0 ? box.x0 : box.y0
  for (const v of room.value.polygon) if (v[axis] !== origin) v[axis] = origin + size
}

const preview = computed(() => {
  const c = cursor.value
  if (!pending.value.length) return []
  if (mode.value === 'rect') return c ? [...rectFrom(pending.value[0]!, c), pending.value[0]!] : pending.value
  return [...pending.value, ...(c ? [c] : [])]
})

const previewLabel = computed(() => {
  if (typed.value) return `${typed.value}▏${t('units.m')}`
  const c = cursor.value
  const last = pending.value.at(-1)
  if (!c || !last) return ''
  const m = (v: number) => (v / 100).toFixed(2)
  if (mode.value === 'rect') return `${m(Math.abs(c[0] - last[0]))} × ${m(Math.abs(c[1] - last[1]))} ${t('units.m')}`
  return `${m(Math.hypot(c[0] - last[0], c[1] - last[1]))} ${t('units.m')}`
})

const opening = computed(() => (sel.value?.kind === 'opening' ? d.value.plan.openings.find((o) => o.id === sel.value!.id) : undefined))
const photo = computed(() => (sel.value?.kind === 'photo' ? d.value.photos.find((p) => p.id === sel.value!.id) : undefined))
const feeders = computed(() => d.value.devices.filter((x) => ['mcb', 'rcbo', 'afdd', 'fuse', 'neozed', 'din-socket', 'switch', 'contactor', 'impulse-relay', 'time-relay', 'dimmer', 'psu', 'ups', 'actuator'].includes(x.type)))

function roomAt(x: number, y: number) {
  return d.value.rooms.find((r) => r.polygon.length >= 3 && pointInPolygon(x, y, r.polygon))?.id
}

function setMode(m: Mode) {
  pending.value = []
  typed.value = ''
  mode.value = m
  if (m !== 'select') sel.value = null
}

async function onCanvas(x: number, y: number) {
  const [px, py] = place(x, y)
  if (mode.value === 'select') {
    sel.value = null
  } else if (mode.value === 'rect') {
    const first = pending.value[0]
    if (!first) pending.value.push([px, py])
    else if (px !== first[0] && py !== first[1]) addRoom(rectFrom(first, [px, py]))
  } else if (mode.value === 'room' || mode.value === 'route') {
    const first = pending.value[0]
    const last = pending.value.at(-1)
    if (mode.value === 'room' && first && pending.value.length >= 3 && Math.hypot(first[0] - px, first[1] - py) < d.value.plan.grid / 3) return finish()
    // a second click on the last vertex (a double click, in practice) ends the line where the cursor already is
    if (last && Math.hypot(last[0] - px, last[1] - py) < d.value.plan.grid / 3) return finish()
    pending.value.push([px, py])
  } else if (mode.value === 'point') {
    const id = uniqueId(
      d.value.points.map((p) => p.id),
      `${newKind.value.slice(0, 3)}-`,
    )
    d.value.points.push({ id, kind: newKind.value, x: px, y: py, room: roomAt(px, py), device: newDevice.value === '__' ? undefined : newDevice.value, count: 1, controls: [] })
    sel.value = { kind: 'point', id }
  } else if (mode.value === 'opening') {
    const wall = wallAt([x, y], d.value.rooms, WALL_REACH)
    if (!wall) return void toast.info(t('editor.plan.openingOnWall'))
    const id = uniqueId(
      d.value.plan.openings.map((o) => o.id),
      `${newOpening.value}-`,
    )
    d.value.plan.openings.push({ id, kind: newOpening.value, x: wall.at[0], y: wall.at[1], angle: wall.angle, width: OPENING_WIDTH[newOpening.value] })
    sel.value = { kind: 'opening', id }
  } else if (mode.value === 'photo') {
    const [file] = await openBinaryFiles('image/*')
    if (!file) return
    busy.value = true
    try {
      const img = await compressImage(file.blob)
      const assetId = newId('photo')
      assets.value[assetId] = img.url
      const id = uniqueId(
        d.value.photos.map((p) => p.id),
        'ph-',
      )
      d.value.photos.push({ id, src: ASSET_PREFIX + assetId, x: px, y: py, room: roomAt(px, py), date: isoDay(new Date()) })
      sel.value = { kind: 'photo', id }
      mode.value = 'select'
    } finally {
      busy.value = false
    }
  }
}

function finish() {
  // too few vertices yet (a double click on the first one, an early Enter): keep drawing
  if (pending.value.length < (mode.value === 'room' ? 3 : 2)) return
  if (mode.value === 'room') return addRoom(pending.value)
  if (mode.value === 'route') {
    const id = uniqueId(
      d.value.routes.map((r) => r.id),
      'rt-',
    )
    d.value.routes.push({
      id,
      points: pending.value.map(([x, y]) => [x, y]),
      device: newRouteKind.value === 'power' || newRouteKind.value === 'bus' ? (newDevice.value === '__' ? undefined : newDevice.value) : undefined,
      safeWidth: 15,
      kind: newRouteKind.value,
      cables: newRouteKind.value === 'low' ? [{ type: 'ethernet', count: 1 }] : [],
    })
    sel.value = { kind: 'route', id }
  }
  pending.value = []
  mode.value = 'select'
}

function onPoint(id: string) {
  if (mode.value === 'select' || mode.value === 'point') sel.value = { kind: 'point', id }
}

function onAlt(e: KeyboardEvent) {
  freeAngle.value = e.altKey
}

function onKey(e: KeyboardEvent) {
  onAlt(e)
  const target = e.target as HTMLElement | null
  if (target?.closest('input,textarea,[contenteditable]')) return
  if (pending.value.length && /^[\d.,x* ]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
    typed.value += e.key
    e.preventDefault()
    return
  }
  if (typed.value && (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Enter')) {
    if (e.key === 'Backspace') typed.value = typed.value.slice(0, -1)
    else if (e.key === 'Escape') typed.value = ''
    else applyTyped()
    e.preventDefault()
    return
  }
  // Esc that closes a dropdown or a dialog is theirs, not the plan's
  if (e.key === 'Escape' && !target?.closest('[role=listbox],[role=dialog]')) {
    pending.value = []
    if (mode.value !== 'select') mode.value = 'select'
    else sel.value = null
  } else if (e.key === 'Enter' && pending.value.length) finish()
  else if (e.key === 'Backspace' && pending.value.length) {
    pending.value.pop()
    e.preventDefault()
  }
  // Backspace on a focused button or select trigger must not delete the selection
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.value && !target?.closest('button,a,[role=combobox],[role=listbox],[role=dialog]')) removeSelected()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onAlt)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  endDrag()
  window.removeEventListener('keyup', onAlt)
})

function removeSelected() {
  const s = sel.value
  if (!s) return
  if (s.kind === 'point') removePoint(d.value, s.id)
  if (s.kind === 'room') removeRoom(d.value, s.id)
  if (s.kind === 'route') d.value.routes = d.value.routes.filter((p) => p.id !== s.id)
  if (s.kind === 'photo') d.value.photos = d.value.photos.filter((p) => p.id !== s.id)
  if (s.kind === 'opening') d.value.plan.openings = d.value.plan.openings.filter((o) => o.id !== s.id)
  sel.value = null
}

// drag handles live in the FloorPlan slot and share its pan/zoom transform
let dragTarget: { set: (x: number, y: number) => void } | null = null
function startDrag(e: PointerEvent, set: (x: number, y: number) => void) {
  e.stopPropagation()
  e.preventDefault()
  dragTarget = { set }
  window.addEventListener('pointermove', onDrag)
  // a touch drag the system takes over (scroll, a gesture) ends in pointercancel, never in pointerup
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}
function onDrag(e: PointerEvent) {
  const pz = plan.value?.pz
  if (!dragTarget || !pz) return
  const [x, y] = pz.toPlan(e.clientX, e.clientY)
  // dragged corners stay on the grid only: snapping to geometry would grab the corner's own wall
  const p: Point2 = point.value && snapOn.value ? placeOnWall([sn(x), sn(y)], d.value.rooms, WALL_REACH) : [sn(x), sn(y)]
  dragTarget.set(p[0], p[1])
}
function endDrag() {
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (point.value) point.value.room = roomAt(point.value.x, point.value.y)
  const ph = photo.value
  if (ph?.x !== undefined && ph.y !== undefined) ph.room = roomAt(ph.x, ph.y)
  dragTarget = null
}

const handleR = computed(() => 9 / Math.sqrt(Math.max(1, plan.value?.pz.scale.value ?? 1)))

async function uploadBackground() {
  const [file] = await openBinaryFiles('image/*,application/pdf')
  if (!file) return
  busy.value = true
  try {
    const img = await planImageFrom(file.blob)
    const assetId = newId('plan')
    assets.value[assetId] = img.url
    d.value.plan.background = ASSET_PREFIX + assetId
    d.value.plan.height = Math.round((d.value.plan.width * img.height) / img.width)
    toast.success(t('editor.plan.bgLoaded'))
  } catch (e) {
    toast.error(t('editor.plan.bgFailed'), { description: (e as Error).message })
  } finally {
    busy.value = false
  }
}

async function replacePhoto() {
  if (!photo.value) return
  const [file] = await openBinaryFiles('image/*')
  if (!file) return
  const img = await compressImage(file.blob)
  const assetId = newId('photo')
  assets.value[assetId] = img.url
  photo.value.src = ASSET_PREFIX + assetId
}

const opacity = computed({
  get: () => [d.value.plan.backgroundOpacity],
  set: (v: number[]) => (d.value.plan.backgroundOpacity = v[0] ?? 0.6),
})

const hint = computed(() => t(`editor.plan.hint.${view3d.value ? 'view3d' : mode.value}`))
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
    <div class="min-w-0 space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <div data-tour="eplan-modes" class="flex overflow-hidden rounded-lg border">
          <button
            v-for="m in MODES"
            :key="m.id"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm transition"
            :class="mode === m.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent'"
            :disabled="view3d && m.id !== 'select'"
            @click="setMode(m.id)"
          >
            <component :is="m.icon" class="size-4" />
            <span class="hidden sm:inline">{{ t(`editor.plan.mode.${m.id}`) }}</span>
          </button>
        </div>
        <template v-if="mode === 'point'">
          <Select v-model="newKind">
            <SelectTrigger class="h-8 w-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in POINT_KINDS" :key="k" :value="k">{{ t(`point.kind.${k}`) }}</SelectItem>
            </SelectContent>
          </Select>
        </template>
        <Select v-if="mode === 'opening'" v-model="newOpening">
          <SelectTrigger class="h-8 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="k in OPENING_KINDS" :key="k" :value="k">{{ t(`editor.plan.openingKind.${k}`) }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-if="mode === 'route'" v-model="newRouteKind">
          <SelectTrigger class="h-8 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="k in ROUTE_KINDS" :key="k" :value="k">{{ t(`editor.plan.routeKinds.${k}`) }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-if="mode === 'point' || (mode === 'route' && (newRouteKind === 'power' || newRouteKind === 'bus'))" v-model="newDevice">
          <SelectTrigger class="h-8 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__">{{ t('editor.plan.noDevice') }}</SelectItem>
            <SelectItem v-for="f in feeders" :key="f.id" :value="f.id">{{ f.id }} · {{ tx(f.label) }}</SelectItem>
          </SelectContent>
        </Select>
        <div class="flex-1" />
        <div data-tour="eplan-3d" class="flex overflow-hidden rounded-lg border text-xs font-medium">
          <button v-for="v in [false, true]" :key="String(v)" class="px-2.5 py-1.5 transition" :class="view3d === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'" :aria-pressed="view3d === v" @click="view3d !== v && toggle3d()">
            {{ v ? '3D' : '2D' }}
          </button>
        </div>
        <label v-if="!view3d" class="flex items-center gap-1.5 text-xs"><Magnet class="size-3.5" /><Switch v-model="snapOn" class="scale-90" /></label>
        <Button size="sm" variant="outline" :disabled="busy" @click="uploadBackground"><ImagePlus /> {{ t('editor.plan.background') }}</Button>
      </div>
      <p class="text-xs text-muted-foreground">{{ hint }}</p>

      <div data-tour="eplan-canvas" class="relative h-[min(72vh,900px)] min-h-[420px] overflow-hidden rounded-2xl border bg-card">
        <Plan3D
          v-if="view3d"
          show-routes
          :focus-point="point?.id"
          :selected-route="route?.id"
          @point="(id) => (sel = { kind: 'point', id })"
          @route="(id) => (sel = { kind: 'route', id })"
          @canvas="sel = null"
        />
        <FloorPlan
          v-else
          ref="plan"
          all-layers
          show-routes
          :pass-rooms="mode !== 'select'"
          :focus-point="point?.id"
          :highlight-room="room?.id ?? null"
          :cursor="mode === 'select' ? undefined : '!cursor-crosshair'"
          @canvas="onCanvas"
          @point="onPoint"
          @room="(id) => mode === 'select' && (sel = { kind: 'room', id })"
          @photo="(id) => (sel = { kind: 'photo', id })"
          @opening="(id) => mode === 'select' && (sel = { kind: 'opening', id })"
          :selected-opening="opening?.id"
          @move="(x, y) => (cursor = place(x, y))"
          @leave="cursor = null"
        >
          <g v-if="pending.length" pointer-events="none">
            <polyline
              :points="preview.map((p) => p.join(',')).join(' ')"
              fill="none"
              stroke="var(--primary)"
              stroke-width="4"
              stroke-dasharray="10 6"
            />
            <circle v-for="(p, i) in pending" :key="i" :cx="p[0]" :cy="p[1]" :r="handleR" fill="var(--primary)" />
            <text v-if="cursor && previewLabel" :x="cursor[0] + 14" :y="cursor[1] - 14" class="seg-len">{{ previewLabel }}</text>
          </g>
          <template v-if="mode === 'select'">
            <circle
              v-if="point"
              :cx="point.x"
              :cy="point.y"
              :r="handleR * 2.2"
              fill="transparent"
              stroke="var(--primary)"
              stroke-width="3"
              class="cursor-move"
              @pointerdown="(e) => startDrag(e, (x, y) => ((point!.x = x), (point!.y = y)))"
            />
            <template v-if="room">
              <circle
                v-for="(v, i) in room.polygon"
                :key="i"
                :cx="v[0]"
                :cy="v[1]"
                :r="handleR"
                fill="var(--background)"
                stroke="var(--primary)"
                stroke-width="3"
                class="cursor-move"
                @pointerdown="(e) => startDrag(e, (x, y) => (room!.polygon[i] = [x, y]))"
              />
            </template>
            <template v-if="route">
              <circle
                v-for="(v, i) in route.points"
                :key="i"
                :cx="v[0]"
                :cy="v[1]"
                :r="handleR"
                fill="var(--background)"
                stroke="var(--danger)"
                stroke-width="3"
                class="cursor-move"
                @pointerdown="(e) => startDrag(e, (x, y) => (route!.points[i] = [x, y]))"
              />
            </template>
            <circle
              v-if="photo && photo.x !== undefined"
              :cx="photo.x"
              :cy="photo.y"
              :r="handleR * 2.2"
              fill="transparent"
              stroke="var(--primary)"
              stroke-width="3"
              class="cursor-move"
              @pointerdown="(e) => startDrag(e, (x, y) => ((photo!.x = x), (photo!.y = y)))"
            />
          </template>
        </FloorPlan>
        <div
          v-if="pending.length"
          class="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur"
          @pointerenter="cursor = null"
        >
          <Button size="sm" :disabled="pending.length < (mode === 'route' ? 2 : 3)" @click="finish"><Check /> {{ t('editor.plan.finish') }} <Kbd class="ml-1">↵</Kbd></Button>
          <Button size="sm" variant="ghost" @click="pending.pop()"><Undo2 /> {{ t('editor.plan.undoPoint') }} <Kbd class="ml-1">⌫</Kbd></Button>
          <Button size="sm" variant="ghost" @click="pending = []"><X /> {{ t('common.cancel') }} <Kbd class="ml-1">Esc</Kbd></Button>
        </div>
      </div>
    </div>

    <aside data-tour="eplan-aside" class="space-y-4">
      <div v-if="point" class="space-y-3 rounded-2xl border bg-card p-4">
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" class="-ml-1.5" :aria-label="t('editor.plan.backToPlan')" @click="sel = null"><ChevronLeft /></Button>
          <component :is="POINT_ICONS[point.kind]" class="size-5" :style="{ color: POINT_COLORS[point.kind] }" />
          <span class="mr-auto font-mono text-xs text-muted-foreground">{{ point.id }}</span>
          <Button variant="destructive" size="icon-sm" :aria-label="t('common.delete')" @click="removeSelected"><Trash2 /></Button>
        </div>
        <FormRow :label="t('editor.plan.kind')">
          <Select v-model="point.kind">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem v-for="k in POINT_KINDS" :key="k" :value="k">{{ t(`point.kind.${k}`) }}</SelectItem></SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.plan.label')"><LocalizedInput v-model="point.label" /></FormRow>
        <FormRow :label="t('editor.plan.device')">
          <Select :model-value="point.device ?? '__'" @update:model-value="(v) => (point!.device = v === '__' ? undefined : (v as string))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">{{ t('editor.plan.noDevice') }}</SelectItem>
              <SelectItem v-for="f in feeders" :key="f.id" :value="f.id">{{ f.id }} · {{ tx(f.label) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.plan.room')">
          <Select :model-value="point.room ?? '__'" @update:model-value="(v) => (point!.room = v === '__' ? undefined : (v as string))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">—</SelectItem>
              <SelectItem v-for="r in d.rooms" :key="r.id" :value="r.id">{{ tx(r.name) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <div class="grid grid-cols-3 gap-2">
          <FormRow :label="t('editor.plan.power')"><NumberInput v-model="point.powerW" optional allow-zero suffix="W" /></FormRow>
          <FormRow :label="t('editor.plan.count')"><NumberInput v-model="point.count" integer /></FormRow>
          <FormRow :label="t('editor.plan.heightMm')"><NumberInput v-model="point.heightMm" optional allow-zero :suffix="t('units.mm')" /></FormRow>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <Switch :model-value="!!point.concealed" @update:model-value="(v) => (point!.concealed = v || undefined)" /> {{ t('editor.plan.concealed') }}
        </label>
        <FormRow v-if="point.kind === 'panel' || point.kind === 'sensor'" :label="t('editor.plan.controls')" :hint="t('editor.plan.controlsHint')">
          <Input
            :model-value="point.controls.join(', ')"
            class="font-mono text-xs"
            placeholder="1/1/1, 3/1/1"
            @update:model-value="(v) => (point!.controls = String(v).split(',').map((s) => s.trim()).filter(Boolean))"
          />
        </FormRow>
        <FormRow :label="t('editor.plan.profile')" :hint="t('editor.plan.profileHint')">
          <Select :model-value="point.profile ?? '__'" @update:model-value="(v) => (point!.profile = v === '__' ? undefined : (v as never))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">—</SelectItem>
              <SelectItem v-for="p in APPLIANCE_PROFILES" :key="p" :value="p">{{ t(`point.profile.${p}`) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      <div v-else-if="room" class="space-y-3 rounded-2xl border bg-card p-4">
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" class="-ml-1.5" :aria-label="t('editor.plan.backToPlan')" @click="sel = null"><ChevronLeft /></Button>
          <Pentagon class="size-5 text-primary" />
          <span class="mr-auto font-mono text-xs text-muted-foreground">{{ room.id }}</span>
          <Button variant="destructive" size="icon-sm" :aria-label="t('common.delete')" @click="removeSelected"><Trash2 /></Button>
        </div>
        <FormRow :label="t('editor.plan.roomName')"><LocalizedInput v-model="room.name" /></FormRow>
        <div v-if="roomBox" class="grid grid-cols-2 gap-2">
          <FormRow :label="t('editor.plan.roomWidth')"><NumberInput :model-value="roomBox.w" :suffix="t('units.cm')" @update:model-value="(v) => resizeRoom(0, v)" /></FormRow>
          <FormRow :label="t('editor.plan.roomDepth')"><NumberInput :model-value="roomBox.h" :suffix="t('units.cm')" @update:model-value="(v) => resizeRoom(1, v)" /></FormRow>
        </div>
        <label class="flex items-center gap-2 text-sm"><Switch v-model="room.wet" /> {{ t('editor.plan.wet') }}</label>
        <FormRow :label="t('editor.plan.ceiling')" :hint="t('editor.plan.ceilingHint', { cm: d.plan.wallHeight })"><NumberInput v-model="room.ceilingCm" optional :suffix="t('units.cm')" :placeholder="String(d.plan.wallHeight)" /></FormRow>
        <p class="text-xs text-muted-foreground">{{ t('editor.plan.roomHint') }}</p>
      </div>

      <div v-else-if="opening" class="space-y-3 rounded-2xl border bg-card p-4">
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" class="-ml-1.5" :aria-label="t('editor.plan.backToPlan')" @click="sel = null"><ChevronLeft /></Button>
          <DoorOpen class="size-5 text-primary" />
          <span class="mr-auto font-mono text-xs text-muted-foreground">{{ opening.id }}</span>
          <Button variant="destructive" size="icon-sm" :aria-label="t('common.delete')" @click="removeSelected"><Trash2 /></Button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FormRow :label="t('editor.plan.kind')">
            <Select v-model="opening.kind">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem v-for="k in OPENING_KINDS" :key="k" :value="k">{{ t(`editor.plan.openingKind.${k}`) }}</SelectItem></SelectContent>
            </Select>
          </FormRow>
          <FormRow :label="t('editor.plan.openingWidth')"><NumberInput v-model="opening.width" integer :suffix="t('units.cm')" /></FormRow>
        </div>
        <label v-if="opening.kind === 'door'" class="flex items-center gap-2 text-sm">
          <Switch :model-value="!!opening.flip" @update:model-value="(v) => (opening!.flip = v || undefined)" /> {{ t('editor.plan.openingFlip') }}
        </label>
      </div>

      <div v-else-if="route" class="space-y-3 rounded-2xl border bg-card p-4">
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" class="-ml-1.5" :aria-label="t('editor.plan.backToPlan')" @click="sel = null"><ChevronLeft /></Button>
          <Spline class="size-5 text-danger" />
          <span class="mr-auto font-mono text-xs text-muted-foreground">{{ route.id }}</span>
          <Button variant="destructive" size="icon-sm" :aria-label="t('common.delete')" @click="removeSelected"><Trash2 /></Button>
        </div>
        <FormRow :label="t('editor.plan.routeKind')">
          <Select v-model="route.kind">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="k in ROUTE_KINDS" :key="k" :value="k">{{ t(`editor.plan.routeKinds.${k}`) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <template v-if="route.kind === 'low' || route.kind === 'conduit'">
          <div class="grid grid-cols-2 gap-2">
            <FormRow :label="t('editor.plan.from')"><LocalizedInput v-model="route.from" /></FormRow>
            <FormRow :label="t('editor.plan.to')"><LocalizedInput v-model="route.to" /></FormRow>
          </div>
          <div class="space-y-1.5">
            <div class="text-xs font-medium text-muted-foreground">{{ t('editor.plan.cables') }}</div>
            <div v-for="(c, ci) in route.cables" :key="ci" class="grid grid-cols-[1fr_3.5rem_1fr_auto] gap-1.5">
              <Select v-model="c.type">
                <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem v-for="ct in CABLE_TYPES" :key="ct" :value="ct">{{ t(`cable.${ct}`) }}</SelectItem></SelectContent>
              </Select>
              <NumberInput v-model="c.count" integer />
              <Input :model-value="c.label ?? ''" :placeholder="t('editor.plan.cableLabel')" @update:model-value="(v) => (c.label = String(v) || undefined)" />
              <Button variant="ghost" size="icon" :aria-label="t('common.delete')" @click="route.cables.splice(ci, 1)"><Trash2 /></Button>
            </div>
            <Button variant="outline" size="sm" @click="route.cables.push({ type: 'ethernet', count: 1 })">{{ t('editor.plan.addCable') }}</Button>
          </div>
          <div v-if="route.kind === 'conduit'" class="grid grid-cols-2 items-end gap-2">
            <FormRow :label="t('editor.plan.diameter')"><NumberInput v-model="route.diameterMm" optional :suffix="t('units.mm')" /></FormRow>
            <label class="flex h-9 items-center gap-2 text-sm"><Switch :model-value="!!route.pullString" @update:model-value="(v) => (route!.pullString = v || undefined)" /> {{ t('editor.plan.pullString') }}</label>
          </div>
        </template>
        <FormRow v-if="route.kind === 'power' || route.kind === 'bus'" :label="t('editor.plan.device')">
          <Select :model-value="route.device ?? '__'" @update:model-value="(v) => (route!.device = v === '__' ? undefined : (v as string))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">{{ t('editor.plan.noDevice') }}</SelectItem>
              <SelectItem v-for="f in d.devices" :key="f.id" :value="f.id">{{ f.id }} · {{ tx(f.label) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.plan.routeNote')"><LocalizedInput v-model="route.note" multiline /></FormRow>
        <div class="grid grid-cols-2 gap-2">
          <FormRow :label="t('editor.plan.mount')">
            <Select :model-value="routeMount(route)" @update:model-value="(v) => (route!.mount = v as 'floor' | 'wall' | 'ceiling')">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="m in ['floor', 'wall', 'ceiling']" :key="m" :value="m">{{ t(`route.mount.${m}`) }}</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow :label="t('editor.plan.safeWidth')"><NumberInput v-model="route.safeWidth" :suffix="t('units.cm')" /></FormRow>
        </div>
        <FormRow v-if="routeMount(route) === 'wall'" :label="t('editor.plan.elevation')" :hint="t('editor.plan.elevationHint')">
          <NumberInput v-model="route.elevation" optional allow-zero :suffix="t('units.cm')" placeholder="30" />
        </FormRow>
      </div>

      <div v-else-if="photo" class="space-y-3 rounded-2xl border bg-card p-4">
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" class="-ml-1.5" :aria-label="t('editor.plan.backToPlan')" @click="sel = null"><ChevronLeft /></Button>
          <Camera class="size-5 text-primary" />
          <span class="mr-auto font-mono text-xs text-muted-foreground">{{ photo.id }}</span>
        </div>
        <img :src="photo.src.startsWith(ASSET_PREFIX) ? assets[photo.src.slice(ASSET_PREFIX.length)] : photo.src" class="aspect-[4/3] w-full rounded-lg object-cover" alt="" />
        <FormRow :label="t('editor.plan.caption')"><LocalizedInput v-model="photo.caption" /></FormRow>
        <div class="grid grid-cols-2 gap-2">
          <FormRow :label="t('maintenance.date')"><Input v-model="photo.date" type="date" /></FormRow>
          <FormRow :label="t('editor.plan.room')">
            <Select :model-value="photo.room ?? '__'" @update:model-value="(v) => (photo!.room = v === '__' ? undefined : (v as string))">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__">—</SelectItem>
                <SelectItem v-for="r in d.rooms" :key="r.id" :value="r.id">{{ tx(r.name) }}</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="replacePhoto"><ImagePlus /> {{ t('editor.plan.replace') }}</Button>
          <Button variant="destructive" size="sm" @click="removeSelected"><Trash2 /> {{ t('common.delete') }}</Button>
        </div>
      </div>

      <div v-else class="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <div class="font-medium">{{ t('editor.plan.summary') }}</div>
        <div class="grid grid-cols-2 gap-2 text-muted-foreground">
          <span>{{ t('editor.plan.rooms') }}: <b class="text-foreground">{{ d.rooms.length }}</b></span>
          <span>{{ t('panel.stat.points') }}: <b class="text-foreground">{{ d.points.length }}</b></span>
          <span>{{ t('editor.plan.routes') }}: <b class="text-foreground">{{ d.routes.length }}</b></span>
          <span>{{ t('nav.photos') }}: <b class="text-foreground">{{ d.photos.length }}</b></span>
        </div>
        <div class="border-t pt-3">
          <div class="mb-1.5 text-xs font-medium text-muted-foreground">{{ t('editor.plan.rooms') }}</div>
          <button v-for="r in d.rooms" :key="r.id" class="block w-full rounded-md px-2 py-1 text-left hover:bg-accent" @click="sel = { kind: 'room', id: r.id }">
            {{ tx(r.name) }}
          </button>
        </div>
        <p v-if="data.issues.length" class="text-xs text-danger">{{ data.issues.length }} {{ t('editor.refIssues') }}</p>
        <div class="grid grid-cols-2 gap-3 border-t pt-3">
          <FormRow :label="t('editor.plan.wallHeight')"><NumberInput v-model="d.plan.wallHeight" :suffix="t('units.cm')" /></FormRow>
          <FormRow :label="t('editor.plan.grid')"><NumberInput v-model="d.plan.grid" :suffix="t('units.cm')" /></FormRow>
          <FormRow :label="t('editor.plan.width')"><NumberInput v-model="d.plan.width" :suffix="t('units.cm')" /></FormRow>
          <FormRow :label="t('editor.plan.height')"><NumberInput v-model="d.plan.height" :suffix="t('units.cm')" /></FormRow>
          <FormRow v-if="d.plan.background" :label="t('editor.plan.opacity')" class="col-span-2">
            <div class="flex items-center gap-2 pt-2">
              <Slider v-model="opacity" :min="0" :max="1" :step="0.05" class="flex-1" />
              <Button variant="ghost" size="icon-sm" :aria-label="t('common.delete')" @click="d.plan.background = undefined"><Trash2 /></Button>
            </div>
          </FormRow>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.seg-len {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  fill: var(--primary);
  paint-order: stroke;
  stroke: var(--background);
  stroke-width: 4px;
}
</style>
