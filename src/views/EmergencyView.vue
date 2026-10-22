<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Flame, House, Phone, PlugZap, RotateCcw, ShieldAlert, Zap, ZapOff } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ContactList from '@/components/common/ContactList.vue'
import DeviceChip from '@/components/common/DeviceChip.vue'
import { POINT_ICONS } from '@/components/common/kinds'
import OutsideDevices from '@/components/panel/OutsideDevices.vue'
import PanelEnclosure from '@/components/panel/PanelEnclosure.vue'
import { locate } from '@/domain/layout'
import type { DeviceType } from '@/domain/model'
import { useText } from '@/composables/useText'
import { useData } from '@/stores/data'
import MarkdownText from '@/components/common/MarkdownText.vue'

type Scenario = 'partial' | 'all' | 'rcd' | 'smell' | 'flicker'
type Guide = 'mcb' | 'rcd' | 'afdd' | 'fuse' | 'relay' | 'all' | 'other'
// one screen per question; the history makes "back" undo exactly the last answer
type Screen =
  | { kind: 'what' }
  | { kind: 'pick'; scenario: 'partial' | 'rcd' }
  | { kind: 'neighbours' }
  | { kind: 'outage' }
  | { kind: 'danger' }
  | { kind: 'guide'; guide: Guide; device?: string; step: number }
  | { kind: 'fixed' }
  | { kind: 'stuck'; guide: Guide }

const data = useData()
const { t, tx, tm, rt } = useText()
const history = ref<Screen[]>([{ kind: 'what' }])
const screen = computed(() => history.value.at(-1)!)

const SCENARIOS: { id: Scenario; icon: typeof Zap; tone: string }[] = [
  { id: 'partial', icon: ZapOff, tone: 'text-warn' },
  { id: 'rcd', icon: ShieldAlert, tone: 'text-info' },
  { id: 'all', icon: House, tone: 'text-foreground' },
  { id: 'flicker', icon: PlugZap, tone: 'text-primary' },
]

function go(s: Screen) {
  history.value = [...history.value, s]
}
function back() {
  if (history.value.length > 1) history.value = history.value.slice(0, -1)
}
function restart() {
  history.value = [{ kind: 'what' }]
}

function choose(s: Scenario) {
  if (s === 'smell') go({ kind: 'danger' })
  else if (s === 'all') go({ kind: 'neighbours' })
  else if (s === 'flicker') go({ kind: 'guide', guide: 'relay', step: 0 })
  else go({ kind: 'pick', scenario: s })
}

const GUIDE_BY_TYPE: Partial<Record<DeviceType, Guide>> = { mcb: 'mcb', switch: 'mcb', rcd: 'rcd', rcbo: 'rcd', afdd: 'afdd', fuse: 'fuse', neozed: 'fuse', 'voltage-relay': 'relay' }

function picked(id: string) {
  const d = data.graph?.byId.get(id)
  const guide: Guide = (d && GUIDE_BY_TYPE[d.type]) || 'other'
  go({ kind: 'guide', guide, device: id, step: 0 })
}

const guideScreen = computed(() => (screen.value.kind === 'guide' ? screen.value : null))
// "neighbours have power" already answers the first step of the whole-flat guide
const steps = computed(() => {
  const g = guideScreen.value
  if (!g) return []
  const all = (tm(`emergency.guide.${g.guide}.steps`) as unknown[]).map((s) => rt(s as never))
  return g.guide === 'all' ? all.slice(1) : all
})

function next() {
  const g = guideScreen.value
  if (!g) return
  if (g.step + 1 < steps.value.length) history.value = [...history.value.slice(0, -1), { ...g, step: g.step + 1 }]
  else go({ kind: 'stuck', guide: g.guide })
}
function prevStep() {
  const g = guideScreen.value
  if (g && g.step > 0) history.value = [...history.value.slice(0, -1), { ...g, step: g.step - 1 }]
  else back()
}

const device = computed(() => (guideScreen.value?.device ? data.graph?.byId.get(guideScreen.value.device) : undefined))
const place = computed(() => (device.value ? locate(data.layout, device.value.id) : undefined))
const children = computed(() => (device.value ? (data.graph?.children.get(device.value.id) ?? []) : []))
const heavy = computed(() =>
  (device.value ? (data.graph?.pointsOf(device.value.id, true) ?? []) : [])
    .filter((p) => (p.powerW ?? 0) >= 1000)
    .sort((a, b) => (b.powerW ?? 0) - (a.powerW ?? 0))
    .slice(0, 6),
)
const relay = computed(() => data.data?.devices.find((d) => d.type === 'voltage-relay'))
const main = computed(() => (data.data?.supply.input ? data.graph?.byId.get(data.data.supply.input) : undefined))
const hasAside = computed(() => {
  const g = guideScreen.value?.guide
  return (g === 'rcd' && children.value.length > 0) || heavy.value.length > 0 || (g === 'relay' && !!relay.value) || (g === 'all' && data.outside.length > 0)
})
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col px-4 pt-5 pb-6 lg:h-full lg:px-8 lg:pt-8">
    <div class="mb-5 flex items-center gap-3">
      <Button v-if="history.length > 1" variant="outline" size="icon" class="shrink-0 rounded-full" :aria-label="t('common.back')" @click="screen.kind === 'guide' ? prevStep() : back()">
        <ChevronLeft />
      </Button>
      <div class="min-w-0">
        <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight lg:text-2xl"><Zap class="size-6 text-danger" /> {{ t('emergency.title') }}</h1>
        <p class="text-sm text-muted-foreground">{{ t('emergency.subtitle') }}</p>
      </div>
      <Button v-if="history.length > 1" variant="ghost" size="sm" class="ml-auto shrink-0" @click="restart"><RotateCcw /> {{ t('emergency.restart') }}</Button>
    </div>

    <div v-if="screen.kind === 'what'" class="space-y-3">
      <h2 class="text-lg font-semibold">{{ t('emergency.q.what') }}</h2>
      <div data-tour="emergency-scenarios" class="grid gap-2.5 sm:grid-cols-2">
        <button
          v-for="s in SCENARIOS"
          :key="s.id"
          class="flex items-start gap-3.5 rounded-2xl border bg-card p-4 text-left transition hover:border-foreground/30"
          @click="choose(s.id)"
        >
          <component :is="s.icon" class="mt-0.5 size-6 shrink-0" :class="s.tone" />
          <div>
            <div class="font-medium">{{ t(`emergency.scenario.${s.id}.title`) }}</div>
            <div class="text-sm text-muted-foreground">{{ t(`emergency.scenario.${s.id}.hint`) }}</div>
          </div>
        </button>
        <button data-tour="emergency-smell" class="flex items-center gap-3.5 rounded-2xl border border-danger/50 bg-danger/8 p-4 text-left transition hover:border-danger sm:col-span-2" @click="choose('smell')">
          <Flame class="size-6 shrink-0 text-danger" />
          <div>
            <div class="font-medium">{{ t('emergency.scenario.smell.title') }}</div>
            <div class="text-sm text-muted-foreground">{{ t('emergency.scenario.smell.hint') }}</div>
          </div>
        </button>
      </div>
    </div>

    <div v-else-if="screen.kind === 'neighbours'" class="space-y-3">
      <h2 class="text-lg font-semibold">{{ t('emergency.q.neighbours') }}</h2>
      <div class="grid gap-2.5 sm:grid-cols-2">
        <button class="rounded-2xl border bg-card p-4 text-left font-medium transition hover:border-foreground/30" @click="go({ kind: 'guide', guide: 'all', step: 0 })">{{ t('emergency.a.neighboursYes') }}</button>
        <button class="rounded-2xl border bg-card p-4 text-left font-medium transition hover:border-foreground/30" @click="go({ kind: 'outage' })">{{ t('emergency.a.neighboursNo') }}</button>
      </div>
    </div>

    <div v-else-if="screen.kind === 'pick'" class="flex min-h-0 flex-1 flex-col">
      <h2 class="text-lg font-semibold">{{ t(screen.scenario === 'rcd' ? 'emergency.pickRcd' : 'emergency.pick') }}</h2>
      <p class="mb-3 text-sm text-muted-foreground">{{ t('emergency.pickHint') }}</p>
      <!-- the enclosure keeps its aspect ratio and shrinks to whatever height is left -->
      <div class="min-h-0 flex-1 [&_svg]:mx-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full lg:[&_svg]:h-full">
        <PanelEnclosure @select="picked" />
      </div>
      <button class="mt-3 self-start text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" @click="go({ kind: 'guide', guide: 'other', step: 0 })">
        {{ t('emergency.notFound') }}
      </button>
    </div>

    <div v-else-if="screen.kind === 'danger'" class="space-y-4 rounded-2xl border-2 border-danger bg-danger/10 p-5">
      <div class="flex items-center gap-3 text-lg font-semibold text-danger"><Flame class="size-6" /> {{ t('emergency.danger.title') }}</div>
      <ol class="list-decimal space-y-2 pl-5">
        <li>{{ t('emergency.danger.s1') }} <DeviceChip v-if="main" :device="main" size="sm" /></li>
        <li>{{ t('emergency.danger.s2') }}</li>
        <li>{{ t('emergency.danger.s3') }}</li>
        <li>{{ t('emergency.danger.s4') }}</li>
      </ol>
      <Button as="a" href="tel:112" class="h-12 w-full bg-danger text-base text-white hover:bg-danger/90"><Phone /> 112</Button>
    </div>

    <div v-else-if="screen.kind === 'outage'" class="space-y-4">
      <div class="rounded-2xl border bg-card p-5">
        <h2 class="mb-1 text-lg font-semibold">{{ t('emergency.outage.title') }}</h2>
        <p class="text-muted-foreground">{{ t('emergency.outage.text') }}</p>
      </div>
      <OutsideDevices :title="t('emergency.outside.title')" :hint="t('emergency.outside.callHint')" />
      <p v-if="!data.outside.length && data.data?.supply.account" class="rounded-2xl border bg-card p-4 text-sm">
        {{ t('panel.outside.account') }} <span class="font-mono">{{ data.data.supply.account }}</span>
      </p>
      <ContactList first="management" />
    </div>

    <div v-else-if="guideScreen" class="grid min-h-0 flex-1 gap-4" :class="hasAside ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : ''">
      <div class="flex min-h-0 flex-col gap-4">
        <div v-if="device" class="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <DeviceChip :device="device" />
          <div class="min-w-0">
            <div class="truncate font-medium">{{ tx(device.label) }}</div>
            <div v-if="place" class="text-sm text-muted-foreground">{{ t('device.place', { row: place.rowIndex + 1, pos: place.position }) }}</div>
          </div>
        </div>
        <div class="rounded-2xl border bg-card p-5">
          <div class="mb-1 flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-semibold">{{ t(`emergency.guide.${guideScreen.guide}.title`) }}</h2>
            <span class="shrink-0 font-mono text-xs text-muted-foreground">{{ t('emergency.stepOf', { n: guideScreen.step + 1, total: steps.length }) }}</span>
          </div>
          <p v-if="guideScreen.step === 0" class="mb-4 text-sm text-muted-foreground">{{ t(`emergency.guide.${guideScreen.guide}.why`) }}</p>
          <div class="mb-4 flex gap-1">
            <span v-for="(_, i) in steps" :key="i" class="h-1 flex-1 rounded-full" :class="i <= guideScreen.step ? 'bg-primary' : 'bg-muted'" />
          </div>
          <p class="text-lg leading-snug">{{ steps[guideScreen.step] }}</p>
          <div class="mt-5 flex flex-wrap gap-2">
            <Button @click="next">
              <template v-if="guideScreen.step + 1 < steps.length">{{ t('emergency.next') }} <ChevronRight /></template>
              <template v-else>{{ t('emergency.notHelped') }}</template>
            </Button>
            <Button v-if="guideScreen.guide !== 'other'" variant="outline" @click="go({ kind: 'fixed' })"><Check /> {{ t('emergency.fixed') }}</Button>
          </div>
        </div>
        <p class="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">{{ t('emergency.never') }}</p>
      </div>

      <aside v-if="hasAside" class="space-y-3 lg:min-h-0 lg:overflow-y-auto">
        <OutsideDevices v-if="guideScreen.guide === 'all'" :title="t('emergency.outside.title')" :hint="t('emergency.outside.hint')" />
        <div v-if="guideScreen.guide === 'rcd' && children.length" class="rounded-2xl border bg-card p-4">
          <h3 class="mb-2 text-sm font-medium">{{ t('emergency.rcdLines') }}</h3>
          <div class="flex flex-wrap gap-1.5">
            <RouterLink v-for="c in children" :key="c.id" :to="`/d/${c.id}`" class="rounded-md hover:bg-accent"><DeviceChip :device="c" size="sm" /></RouterLink>
          </div>
        </div>
        <div v-if="heavy.length" class="rounded-2xl border bg-card p-4">
          <h3 class="mb-2 text-sm font-medium">{{ t(guideScreen.guide === 'rcd' ? 'emergency.suspectsLeak' : 'emergency.suspects') }}</h3>
          <ul class="space-y-1.5">
            <li v-for="p in heavy" :key="p.id" class="flex items-center gap-2 text-sm">
              <component :is="POINT_ICONS[p.kind]" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ tx(p.label, t(`point.kind.${p.kind}`)) }}</span>
              <span class="font-mono text-xs text-muted-foreground">{{ ((p.powerW ?? 0) / 1000).toFixed(1) }} kW</span>
            </li>
          </ul>
        </div>
        <div v-if="guideScreen.guide === 'relay' && relay" class="rounded-2xl border bg-card p-4 text-sm">
          <RouterLink :to="`/d/${relay.id}`" class="flex items-center gap-2"><DeviceChip :device="relay" size="sm" /> {{ tx(relay.label) }}</RouterLink>
          <MarkdownText v-for="(n, i) in relay.notes" :key="i" :text="n.text" class="mt-2 text-muted-foreground" />
        </div>
      </aside>
    </div>

    <div v-else-if="screen.kind === 'fixed'" class="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center">
      <CircleCheck class="size-10 text-live" />
      <h2 class="text-lg font-semibold">{{ t('emergency.done.title') }}</h2>
      <p class="max-w-md text-muted-foreground">{{ t('emergency.done.text') }}</p>
      <Button variant="outline" class="mt-2" @click="restart">{{ t('emergency.restart') }}</Button>
    </div>

    <div v-else-if="screen.kind === 'stuck'" class="space-y-4">
      <div class="rounded-2xl border bg-card p-5">
        <h2 class="mb-1 text-lg font-semibold">{{ t('emergency.stuck.title') }}</h2>
        <p class="text-muted-foreground">{{ t('emergency.stuck.text') }}</p>
      </div>
      <ContactList :first="screen.guide === 'relay' ? 'management' : 'electrician'" />
    </div>
  </div>
</template>
