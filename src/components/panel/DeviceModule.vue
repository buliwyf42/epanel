<script setup lang="ts">
import { computed } from 'vue'
import { BLOCK_COLORS, blockColor, SMART_TYPES, type Device } from '@/domain/model'
import { useData } from '@/stores/data'
import { HEIGHT, MODULE } from './geometry'

const props = defineProps<{
  device: Device
  width: number
  // lever position: false only when the user switched it off in simulation
  on: boolean
  // whether voltage reaches this device at all
  energized: boolean
  selected?: boolean
  dimmed?: boolean
  issue?: 'error' | 'warn'
}>()

const store = useData()
const W = computed(() => props.width * MODULE)
const poles = computed(() => Math.max(1, Math.min(props.device.poles, Math.round(props.width))))
const t = computed(() => props.device.type)
const rating = computed(() => {
  const d = props.device
  if (!d.rating) return ''
  return d.curve ? `${d.curve}${d.rating}` : `${d.rating}A`
})
const isBreakerLike = computed(() => ['mcb', 'rcd', 'rcbo', 'switch', 'afdd'].includes(t.value))
const hasTestButton = computed(() => ['rcd', 'rcbo', 'afdd'].includes(t.value))
const leverPoles = computed(() => (hasTestButton.value ? 1 : poles.value))
const leverX = 4
const isSmart = computed(() => SMART_TYPES.includes(t.value))
const channels = computed(() => props.device.smart?.channels.slice(0, Math.max(2, Math.floor(props.width * 2))) ?? [])
function channelX(i: number) {
  const n = Math.max(1, channels.value.length)
  return 8 + (i + 0.5) * ((W.value - 16) / n)
}
const leverW = computed(() => leverPoles.value * MODULE - 8)
const leverColor = computed(() => {
  if (t.value === 'switch') return 'url(#lever-red)'
  if (t.value === 'rcd') return 'url(#lever-blue)'
  if (t.value === 'rcbo') return 'url(#lever-violet)'
  if (t.value === 'afdd') return 'url(#lever-violet)'
  return 'url(#lever-dark)'
})

// screws follow the terminals when they are known, otherwise one per module as before
const perModule = computed(() => Math.max(1, Math.round(props.width)))
const sideCount = (side: 'top' | 'bottom') => props.device.terminals.filter((x) => x.side === side).length
const screwsTop = computed(() => (props.device.terminals.length ? sideCount('top') : perModule.value))
const screwsBottom = computed(() => (props.device.terminals.length ? sideCount('bottom') : perModule.value))
const screwX = (i: number, n: number) => (i + 0.5) * (W.value / n)

// terminal block: a coloured housing with a grid of clamp points, top-side terminals in the upper rows
const blockFill = computed(() => {
  const c = blockColor(props.device)
  return c ? (BLOCK_COLORS[c] ?? c) : '#9aa4b2'
})
const blockDark = computed(() => ['black', 'brown', 'blue', 'red'].includes(blockColor(props.device) ?? ''))
const blockLabel = computed(() => {
  const cs = new Set(props.device.terminals.map((x) => x.conductor).filter(Boolean))
  return cs.size === 1 ? [...cs][0] : ''
})
const blockHoles = computed(() => {
  const ts = [...props.device.terminals].sort((a, b) => (a.side === b.side ? 0 : a.side === 'top' ? -1 : 1))
  const n = ts.length || 6
  const cols = Math.max(1, Math.min(n, Math.floor((W.value - 6) / 16)))
  const rows = Math.ceil(n / cols)
  const top = 46
  const bottom = HEIGHT - 52
  const dx = (W.value - 6) / cols
  const dy = (bottom - top) / rows
  return Array.from({ length: n }, (_, i) => ({ x: 3 + dx * ((i % cols) + 0.5), y: top + dy * (Math.floor(i / cols) + 0.5), r: Math.max(2, Math.min(6, dx / 2 - 2, dy / 2 - 2)), id: ts[i]?.id, linked: !!ts[i]?.to }))
})

// no live data yet: the relay shows the nominal supply voltage and the meter no reading,
// so nothing on screen can be mistaken for a measurement
const nominalVolts = computed(() => store.data?.supply.voltage ?? 230)
const psuCurrent = computed(() => (props.device.rating ? `${Math.round(props.device.rating * 1000)} mA` : ''))
// squeeze long model names into the module face instead of letting them spill onto neighbours
function fitWidth(text?: string) {
  const room = W.value - 8
  return text && text.length * 4.8 > room ? room : undefined
}
const busColor = computed(() => {
  const id = props.device.id.toUpperCase()
  if (id.includes('PE') || props.device.tags.some((x) => /pe|земл|earth/i.test(x))) return 'pe'
  return 'n'
})
</script>

<template>
  <g
    class="device"
    :class="{ 'is-selected': selected, 'is-dimmed': dimmed, 'is-dead': !energized }"
    :data-type="t"
  >
    <rect
      v-if="selected"
      :x="-4"
      :y="-4"
      :width="W + 8"
      :height="HEIGHT + 8"
      rx="8"
      fill="none"
      stroke="var(--live)"
      stroke-width="3"
      filter="url(#glow)"
      class="sel-ring"
    />

    <template v-if="t !== 'bus' && t !== 'terminal'">
      <rect x="1" y="0" :width="W - 2" :height="HEIGHT" rx="4" fill="url(#body)" stroke="#a8a8a0" stroke-width="1" />
      <rect x="3" y="3" :width="W - 6" height="26" rx="2" fill="url(#recess)" />
      <rect x="3" :y="HEIGHT - 29" :width="W - 6" height="26" rx="2" fill="url(#recess)" />
      <g v-for="i in screwsTop" :key="'t' + i">
        <circle :cx="screwX(i - 1, screwsTop)" cy="16" r="7" fill="url(#screw)" stroke="#6b6b66" stroke-width="0.8" />
        <line :x1="screwX(i - 1, screwsTop) - 5" y1="16" :x2="screwX(i - 1, screwsTop) + 5" y2="16" stroke="#55554f" stroke-width="1.6" />
        <circle v-if="energized" :cx="screwX(i - 1, screwsTop)" cy="16" r="3" fill="var(--live)" class="live-dot" />
      </g>
      <g v-for="i in screwsBottom" :key="'b' + i">
        <circle :cx="screwX(i - 1, screwsBottom)" :cy="HEIGHT - 16" r="7" fill="url(#screw)" stroke="#6b6b66" stroke-width="0.8" />
        <line :x1="screwX(i - 1, screwsBottom) - 5" :y1="HEIGHT - 16" :x2="screwX(i - 1, screwsBottom) + 5" :y2="HEIGHT - 16" stroke="#55554f" stroke-width="1.6" />
      </g>
      <rect x="2" y="40" :width="W - 4" :height="HEIGHT - 80" rx="3" fill="url(#shoulder)" stroke="#c4c4bc" stroke-width="0.6" />
    </template>

    <template v-if="isBreakerLike">
      <text :x="W / 2" y="54" text-anchor="middle" class="brand">{{ device.brand ?? '' }}</text>
      <rect :x="leverX - 1" y="66" :width="leverW + 2" height="46" rx="3" fill="#2a2a28" />
      <!-- position indicator: red I when on, green O when off, as printed on most European breakers -->
      <rect :x="leverX + leverW / 2 - 5" y="60" width="10" height="5" rx="1" :fill="on ? '#d93a2b' : '#2f9e44'" />
      <g class="lever" :style="{ transform: `translateY(${on ? 0 : 20}px)` }">
        <rect :x="leverX + 1" y="68" :width="leverW - 2" height="22" rx="3" :fill="leverColor" />
        <rect :x="leverX + 3" y="70" :width="leverW - 6" height="4" rx="1.5" fill="white" opacity="0.25" />
      </g>
      <template v-if="hasTestButton">
        <circle :cx="W - MODULE / 2" cy="80" r="8" fill="#e8c547" stroke="#a88a1e" />
        <text :x="W - MODULE / 2" y="83.5" text-anchor="middle" class="test">T</text>
        <template v-if="t === 'afdd'">
          <circle :cx="W - MODULE / 2" cy="100" r="3" :fill="energized ? '#22c55e' : '#3a3a3a'" />
          <text :x="W - MODULE / 2" y="114" text-anchor="middle" class="tiny">AFDD</text>
        </template>
        <template v-else>
          <text :x="W - MODULE / 2" y="104" text-anchor="middle" class="small">{{ device.leakage ? `${device.leakage}mA` : '' }}</text>
          <text v-if="device.rcdClass" :x="W - MODULE / 2" y="114" text-anchor="middle" class="tiny">type {{ device.rcdClass }}</text>
        </template>
      </template>
      <text :x="(hasTestButton ? leverW / 2 + leverX : W / 2)" y="128" text-anchor="middle" class="rating">{{ rating }}</text>
    </template>

    <template v-else-if="t === 'voltage-relay'">
      <text :x="W / 2" y="54" text-anchor="middle" class="brand">{{ device.brand ?? '' }}</text>
      <rect x="6" y="62" :width="W - 12" height="30" rx="3" fill="url(#lcd)" stroke="#123" />
      <text :x="W / 2" y="84" text-anchor="middle" class="seg" :class="{ off: !energized }">{{ energized ? nominalVolts : '---' }}</text>
      <circle cx="12" cy="102" r="3" :fill="energized ? '#22c55e' : '#3a3a3a'" />
      <circle :cx="W - 20" cy="104" r="5" fill="#d1d1ca" stroke="#999" />
      <circle :cx="W - 8 - 0" cy="104" r="5" fill="#d1d1ca" stroke="#999" />
      <text :x="W / 2" y="128" text-anchor="middle" class="rating">{{ rating }}</text>
    </template>

    <template v-else-if="t === 'meter'">
      <text x="8" y="54" class="brand" text-anchor="start">{{ device.brand ?? '' }}</text>
      <rect x="6" y="60" :width="W - 12" height="32" rx="3" fill="url(#lcd)" stroke="#123" />
      <text :x="W - 12" y="83" text-anchor="end" class="seg seg-sm" :class="{ off: !energized }">------.-</text>
      <text :x="W - 10" y="104" text-anchor="end" class="small">kWh</text>
      <circle cx="14" cy="104" r="3.5" :fill="energized ? '#ef4444' : '#3a3a3a'" :class="{ blink: energized }" />
      <text x="22" y="107" class="tiny" text-anchor="start">imp</text>
      <text :x="W / 2" y="126" text-anchor="middle" class="small">{{ device.model ?? '' }}</text>
    </template>

    <!-- surge protector: plug-in cartridges with indicator windows -->
    <template v-else-if="t === 'spd'">
      <g v-for="i in poles" :key="'c' + i">
        <rect :x="(i - 1) * MODULE + 4" y="44" :width="MODULE - 8" :height="HEIGHT - 88" rx="3" fill="url(#shoulder)" stroke="#9a9a92" />
        <rect :x="(i - 1) * MODULE + MODULE / 2 - 6" y="56" width="12" height="9" rx="1.5" fill="#22c55e" stroke="#166534" />
        <text :x="(i - 1) * MODULE + MODULE / 2" y="100" text-anchor="middle" class="tiny">{{ i === poles && poles > 1 ? 'N' : 'L' }}</text>
      </g>
      <text :x="W / 2" y="126" text-anchor="middle" class="small" :textLength="fitWidth(device.model)" lengthAdjust="spacingAndGlyphs">{{ device.model ?? '' }}</text>
    </template>

    <template v-else-if="t === 'din-socket'">
      <circle :cx="W / 2" cy="88" r="30" fill="#e9e9e3" stroke="#a0a098" />
      <circle :cx="W / 2" cy="88" r="24" fill="#d8d8d0" />
      <circle :cx="W / 2 - 9" cy="88" r="3.5" fill="#333" />
      <circle :cx="W / 2 + 9" cy="88" r="3.5" fill="#333" />
      <rect :x="W / 2 - 3" y="62" width="6" height="5" fill="#b0b0a8" />
      <rect :x="W / 2 - 3" y="109" width="6" height="5" fill="#b0b0a8" />
    </template>

    <template v-else-if="t === 'contactor'">
      <rect x="8" y="64" :width="W - 16" height="26" rx="2" fill="#30302d" />
      <rect :x="W / 2 - 6" :y="on && energized ? 66 : 76" width="12" height="12" rx="2" fill="#e5e5e0" class="lever" />
      <text :x="W / 2" y="110" text-anchor="middle" class="tiny">A1 · A2</text>
      <text :x="W / 2" y="128" text-anchor="middle" class="rating">{{ rating }}</text>
    </template>

    <template v-else-if="t === 'bus'">
      <rect x="1" y="60" :width="W - 2" height="56" rx="4" :fill="busColor === 'pe' ? 'url(#pe-base)' : 'url(#n-base)'" stroke="#334" stroke-opacity="0.4" />
      <rect x="6" y="76" :width="W - 12" height="24" rx="2" fill="url(#brass)" stroke="#7a5f17" />
      <g v-for="i in Math.max(2, Math.round(width * 2))" :key="'s' + i">
        <circle :cx="6 + (i - 0.5) * ((W - 12) / Math.max(2, Math.round(width * 2)))" cy="88" r="5" fill="url(#screw)" stroke="#6b5a20" stroke-width="0.6" />
      </g>
      <text :x="W / 2" y="132" text-anchor="middle" class="busl">{{ busColor === 'pe' ? 'PE' : 'N' }}</text>
    </template>

    <template v-else-if="t === 'terminal'">
      <rect x="1" y="34" :width="W - 2" :height="HEIGHT - 68" rx="4" :fill="blockFill" stroke="#334" stroke-opacity="0.45" />
      <g v-for="(h, i) in blockHoles" :key="'k' + i">
        <circle :cx="h.x" :cy="h.y" :r="h.r + 1.5" fill="#1f2226" opacity="0.55" />
        <circle :cx="h.x" :cy="h.y" :r="h.r" fill="url(#screw)" stroke="#6b6b66" stroke-width="0.6" />
        <circle v-if="h.linked" :cx="h.x" :cy="h.y" r="1.6" fill="#f5c542" />
      </g>
      <text v-if="blockLabel" :x="W / 2" :y="HEIGHT - 40" text-anchor="middle" class="busl" :style="{ fill: blockDark ? '#f4f4f0' : '#1b1b1b' }">{{ blockLabel }}</text>
    </template>

    <!-- fuse holder: the carrier swings down to open; the window shows a blown cartridge -->
    <template v-else-if="t === 'fuse'">
      <g v-for="i in poles" :key="'f' + i">
        <rect :x="(i - 1) * MODULE + 4" y="50" :width="MODULE - 8" height="78" rx="3" fill="url(#shoulder)" stroke="#9a9a92" />
        <rect :x="(i - 1) * MODULE + MODULE / 2 - 5" y="62" width="10" height="34" rx="2" fill="#f2efe4" stroke="#8a8578" />
        <rect :x="(i - 1) * MODULE + MODULE / 2 - 3" y="74" width="6" height="8" rx="1" :fill="energized ? '#22c55e' : '#3a3a3a'" />
      </g>
      <text :x="W / 2" y="140" text-anchor="middle" class="rating">{{ device.rating ? `${device.rating}A` : '' }}</text>
    </template>

    <template v-else-if="t === 'time-relay'">
      <text :x="W / 2" y="54" text-anchor="middle" class="brand">{{ device.brand ?? '' }}</text>
      <rect x="6" y="62" :width="W - 12" height="26" rx="3" fill="url(#lcd)" stroke="#123" />
      <text :x="W / 2" y="81" text-anchor="middle" class="seg seg-sm" :class="{ off: !energized }">{{ energized ? '12:00' : '--:--' }}</text>
      <g v-for="i in 3" :key="'b' + i">
        <rect :x="6 + (i - 1) * ((W - 12) / 3) + 2" y="96" :width="(W - 12) / 3 - 4" height="8" rx="2" fill="#d1d1ca" stroke="#999" />
      </g>
      <text :x="W / 2" y="128" text-anchor="middle" class="rating">{{ rating }}</text>
    </template>

    <template v-else-if="t === 'impulse-relay'">
      <rect x="8" y="64" :width="W - 16" height="26" rx="2" fill="#30302d" />
      <rect :x="W / 2 - 6" :y="on && energized ? 66 : 76" width="12" height="12" rx="2" fill="#e5e5e0" class="lever" />
      <circle :cx="W / 2" cy="104" r="5" fill="#d1d1ca" stroke="#999" />
      <text :x="W / 2" y="128" text-anchor="middle" class="rating">{{ rating }}</text>
    </template>

    <template v-else-if="t === 'dimmer'">
      <circle :cx="W / 2" cy="82" r="14" fill="#2a2a28" stroke="#111" />
      <line :x1="W / 2" y1="82" :x2="W / 2 + 8" y2="72" stroke="#e5e5e0" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="12" cy="106" r="3" :fill="energized ? '#f59e0b' : '#3a3a3a'" :class="{ 'led-on': energized }" />
      <text :x="W / 2" y="128" text-anchor="middle" class="small">{{ device.model ?? '' }}</text>
    </template>

    <template v-else-if="t === 'psu'">
      <text x="8" y="54" class="brand" text-anchor="start">{{ device.brand ?? '' }}</text>
      <circle cx="14" cy="72" r="3.2" :fill="energized ? '#22c55e' : '#3a3a3a'" />
      <text x="22" y="75" class="tiny" text-anchor="start">DC OK</text>
      <circle :cx="W - 14" cy="72" r="5" fill="#d1d1ca" stroke="#999" />
      <text :x="W / 2" y="104" text-anchor="middle" class="rating">{{ device.model ?? 'DC' }}</text>
      <text :x="W / 2" y="122" text-anchor="middle" class="small">{{ device.rating ? `${device.rating} A` : '' }}</text>
    </template>

    <!-- transfer switch: two inputs, one of them is live at a time -->
    <template v-else-if="t === 'ats'">
      <g v-for="(n, i) in ['I', 'II']" :key="n" :transform="`translate(${(i + 0.5) * (W / 2)}, 0)`">
        <rect x="-10" y="64" width="20" height="36" rx="3" fill="#2a2a28" />
        <rect x="-8" :y="i === 0 && energized ? 66 : 82" width="16" height="16" rx="2" fill="url(#lever-red)" class="lever" />
        <text y="114" text-anchor="middle" class="tiny">{{ n }}</text>
        <circle cy="56" r="3" :fill="i === 0 && energized ? '#22c55e' : '#3a3a3a'" />
      </g>
      <text :x="W / 2" y="134" text-anchor="middle" class="rating">{{ rating }}</text>
    </template>

    <template v-else-if="t === 'ups'">
      <text x="8" y="54" class="brand" text-anchor="start">{{ device.brand ?? '' }}</text>
      <rect :x="W / 2 - 16" y="66" width="30" height="16" rx="2" fill="none" stroke="#3a3a3a" stroke-width="2" />
      <rect :x="W / 2 + 14" y="71" width="3" height="6" fill="#3a3a3a" />
      <rect :x="W / 2 - 13" y="69" :width="energized ? 24 : 6" height="10" rx="1" :fill="energized ? '#22c55e' : '#ef4444'" />
      <circle cx="14" cy="98" r="3" :fill="energized ? '#22c55e' : '#3a3a3a'" />
      <text x="22" y="101" class="tiny" text-anchor="start">AC</text>
      <circle cx="14" cy="110" r="3" :fill="energized ? '#3a3a3a' : '#f59e0b'" />
      <text x="22" y="113" class="tiny" text-anchor="start">BAT</text>
      <text :x="W / 2" y="132" text-anchor="middle" class="small">{{ device.model ?? '' }}</text>
    </template>

    <!-- bus devices (KNX and friends): bus terminal, channel LEDs, manual buttons -->
    <template v-else-if="isSmart">
      <text x="8" y="54" class="brand" text-anchor="start">{{ (device.smart?.system ?? 'knx').toUpperCase() }}</text>
      <g :transform="`translate(${W - 22}, 45)`">
        <rect width="16" height="10" rx="1.5" fill="#c62828" />
        <rect x="8" width="8" height="10" rx="1.5" fill="#222" />
      </g>
      <template v-if="t === 'actuator' || t === 'bus-io'">
        <g v-for="(ch, i) in channels" :key="ch.id" :transform="`translate(${channelX(i)}, 66)`">
          <circle cx="0" cy="0" r="3.2" :fill="energized ? (t === 'actuator' ? '#f59e0b' : '#22c55e') : '#3a3a3a'" :class="{ 'led-on': energized }" />
          <rect x="-5" y="8" width="10" height="7" rx="1.5" fill="#d8d8d0" stroke="#999" stroke-width="0.6" />
          <text y="27" text-anchor="middle" class="tiny">{{ ch.id }}</text>
        </g>
      </template>
      <template v-else-if="t === 'bus-gateway'">
        <rect :x="W / 2 - 11" y="66" width="22" height="18" rx="1.5" fill="#2a2a28" />
        <rect :x="W / 2 - 7" y="70" width="14" height="10" fill="#111" />
        <circle :cx="W / 2 - 7" cy="92" r="2.4" :fill="energized ? '#22c55e' : '#3a3a3a'" :class="{ blink: energized }" />
        <circle :cx="W / 2 + 7" cy="92" r="2.4" :fill="energized ? '#f59e0b' : '#3a3a3a'" />
        <text :x="W / 2" y="110" text-anchor="middle" class="tiny">IP</text>
      </template>
      <template v-else>
        <circle cx="14" cy="74" r="3.2" :fill="energized ? '#22c55e' : '#3a3a3a'" />
        <text x="22" y="77" class="tiny" text-anchor="start">run</text>
        <circle cx="14" cy="88" r="3.2" fill="#3a3a3a" />
        <text x="22" y="91" class="tiny" text-anchor="start">I&gt;Imax</text>
        <text :x="W / 2" y="112" text-anchor="middle" class="small">{{ psuCurrent }}</text>
      </template>
      <text :x="W / 2" y="128" text-anchor="middle" class="small">{{ device.smart?.address ?? device.model ?? '' }}</text>
    </template>
    <template v-else>
      <text :x="W / 2" y="92" text-anchor="middle" class="rating">{{ rating || device.id }}</text>
    </template>

    <rect
      v-if="!energized"
      x="1"
      y="0"
      :width="W - 2"
      :height="HEIGHT"
      rx="4"
      fill="#0b1b33"
      opacity="0.38"
      class="dead"
      pointer-events="none"
    />

    <g v-if="issue" :transform="`translate(${W - 9}, 40)`">
      <circle r="8" :fill="issue === 'error' ? 'var(--danger)' : 'var(--warn)'" stroke="white" stroke-width="1.5" />
      <text y="4" text-anchor="middle" class="issue">!</text>
    </g>
  </g>
</template>

<style scoped>
.device {
  transition: opacity 0.25s ease, filter 0.25s ease;
}
.device.is-dimmed {
  /* faded, not transparent: with opacity the DIN rail behind showed through the module body */
  filter: grayscale(0.85) contrast(0.4) brightness(1.3);
}
.lever {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-box: fill-box;
}
.sel-ring {
  animation: sel 1.8s ease-in-out infinite;
}
@keyframes sel {
  50% {
    stroke-opacity: 0.45;
  }
}
.live-dot {
  opacity: 0.55;
  animation: blink 2.4s ease-in-out infinite;
}
.blink {
  animation: blink 0.9s steps(2) infinite;
}
.led-on {
  filter: drop-shadow(0 0 2px currentColor);
}
.dead {
  transition: opacity 0.3s ease;
}
text {
  font-family: var(--font-mono);
  fill: #2a2a28;
  user-select: none;
}
.brand {
  font-family: var(--font-sans);
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  fill: #6b6b66;
}
.rating {
  font-size: 12px;
  font-weight: 600;
}
.small {
  font-size: 8px;
}
.tiny {
  font-size: 6.5px;
  fill: #55554f;
}
.test {
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 700;
}
.seg {
  font-size: 18px;
  font-weight: 600;
  fill: #7cf29a;
  letter-spacing: 0.06em;
}
.seg-sm {
  font-size: 15px;
}
.seg.off {
  fill: #2f4f3a;
}
.busl {
  font-size: 14px;
  font-weight: 700;
  fill: #f4f4f1;
  paint-order: stroke;
  stroke: #333;
  stroke-width: 2px;
}
.issue {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 800;
  fill: white;
}
</style>
