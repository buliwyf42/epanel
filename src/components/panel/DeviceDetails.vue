<script setup lang="ts">
import { viewerOnly } from '@/platform'
import { computed, defineAsyncComponent, ref } from 'vue'
import { useOpenedOnce } from '@/composables/useOpenedOnce'
import { useRouter } from 'vue-router'
import { ArrowDownToLine, ArrowUpFromLine, Map as MapIcon, MapPin, MessageSquarePlus, Power, QrCode, Send } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import DeviceChip from '@/components/common/DeviceChip.vue'
import CheckItem from '@/components/common/CheckItem.vue'
import { POINT_ICONS } from '@/components/common/kinds'
import FloorPlan from '@/components/plan/FloorPlan.vue'
import { locate } from '@/domain/layout'
import { deviceLoad } from '@/domain/load'
import { isoDay } from '@/domain/maintenance'
import type { PlanPoint } from '@/domain/model'
import { refKey } from '@/domain/terminals'
import { useText } from '@/composables/useText'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import MarkdownText from '@/components/common/MarkdownText.vue'

const props = defineProps<{ id: string }>()
const data = useData()
const ui = useUi()
const router = useRouter()
const { t, tx } = useText()

const device = computed(() => data.graph?.byId.get(props.id))
const place = computed(() => locate(data.layout, props.id))
const upstream = computed(() => data.graph?.ancestors(props.id) ?? [])
const children = computed(() => data.graph?.children.get(props.id) ?? [])
const points = computed(() => data.graph?.pointsOf(props.id, true) ?? [])
const pointIds = computed(() => new Set(points.value.map((p) => p.id)))
const load = computed(() => (device.value && data.graph ? deviceLoad(data.graph, device.value, data.data!.supply.voltage) : null))
const checks = computed(() => data.checks.filter((c) => c.device === props.id))
const rcd = computed(() => data.graph?.rcdChain(props.id)[0])
// each terminal with every device it is linked to, whichever end stored the link
const terminalRows = computed(() =>
  (device.value?.terminals ?? []).map((tt) => ({
    tt,
    links: (data.graph?.terminals.links.get(refKey(props.id, tt.id)) ?? []).map((o) => ({ device: o.device.id, ref: refKey(o.device.id, o.terminal.id) })),
  })),
)

const byRoom = computed(() => {
  const m = new Map<string, PlanPoint[]>()
  for (const p of points.value) {
    const k = p.room ?? ''
    m.set(k, [...(m.get(k) ?? []), p])
  }
  return [...m.entries()].map(([room, pts]) => ({
    room,
    name: tx(data.data?.rooms.find((r) => r.id === room)?.name, t('common.noRoom')),
    pts,
  }))
})

const specs = computed(() => {
  const d = device.value
  if (!d) return []
  const rows: [string, string][] = []
  if (d.rating) rows.push([t('device.field.rating'), `${d.curve ?? ''}${d.rating} A`])
  rows.push([t('device.field.poles'), d.poles === 2 ? '1P+N' : `${d.poles}P`])
  if (d.leakage) rows.push([t('device.field.leakage'), `${d.leakage} mA${d.rcdClass ? ` · ${t('device.field.class')} ${d.rcdClass}` : ''}`])
  if (d.circuit?.cable) rows.push([t('device.field.cable'), d.circuit.cable])
  else if (d.circuit?.crossSection) rows.push([t('device.field.section'), `${d.circuit.crossSection} ${t('units.mm2')}`])
  if (d.circuit?.lengthM) rows.push([t('device.field.length'), `${d.circuit.lengthM} ${t('units.m')}`])
  if (d.brand || d.model) rows.push([t('device.field.model'), [d.brand, d.model].filter(Boolean).join(' ')])
  if (d.serial) rows.push([t('device.field.serial'), d.serial])
  if (d.phase) rows.push([t('device.field.phase'), d.phase])
  if (rcd.value && rcd.value.id !== d.id) rows.push([t('device.field.rcd'), `${rcd.value.id} · ${rcd.value.leakage ?? '?'} mA`])
  return rows
})

const utilPct = computed(() => Math.round((load.value?.utilization ?? 0) * 100))
const utilTone = computed(() => (utilPct.value > 100 ? 'bg-danger' : utilPct.value > 80 ? 'bg-warn' : 'bg-ok'))

const qrOpen = ref(false)
const QrDialog = defineAsyncComponent(() => import('@/components/common/QrDialog.vue'))
const qrUsed = useOpenedOnce(qrOpen)
const noteOpen = ref(false)
const noteText = ref('')
const noteAuthor = ref(localStorage.getItem('panel.author') ?? '')

function addNote() {
  const text = noteText.value.trim()
  if (!text) return
  const draft = data.startDraft()
  const dev = draft.data.devices.find((x) => x.id === props.id)
  if (!dev) return
  dev.notes.push({ author: noteAuthor.value.trim(), date: isoDay(new Date()), text })
  try {
    localStorage.setItem('panel.author', noteAuthor.value.trim())
  } catch {
    // storage blocked
  }
  noteText.value = ''
  noteOpen.value = false
}

function simulateOff() {
  ui.simulate = true
  if (!ui.off.has(props.id)) ui.toggleOff(props.id)
  router.push({ path: '/plan', query: { device: props.id } })
}
</script>

<template>
  <div v-if="device" class="space-y-6">
    <header class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <DeviceChip :device="device" size="lg" />
        <span class="text-sm text-muted-foreground">{{ t(`device.type.${device.type}`) }}</span>
      </div>
      <h2 class="text-xl leading-snug font-semibold text-balance">{{ tx(device.label) || t(`device.type.${device.type}`) }}</h2>
      <p v-if="place" class="text-sm text-muted-foreground">
        {{ t('device.place', { row: place.rowIndex + 1, pos: place.position }) }}
      </p>
      <p v-else-if="device.location" class="flex gap-1.5 text-sm text-muted-foreground">
        <MapPin class="mt-0.5 size-4 shrink-0 text-primary" /><MarkdownText :text="tx(device.location)" />
      </p>
      <div v-if="device.tags.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="tag in device.tags"
          :key="tag"
          class="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
          @click="ui.filterTag = tag"
        >
          #{{ tag }}
        </button>
      </div>
    </header>

    <div class="flex flex-wrap gap-2">
      <Button v-if="points.length" variant="outline" size="sm" @click="router.push({ path: '/plan', query: { device: id } })">
        <MapIcon /> {{ t('device.showOnPlan') }}
      </Button>
      <Button variant="outline" size="sm" @click="simulateOff"><Power /> {{ t('device.simulate') }}</Button>
      <Button variant="outline" size="sm" @click="qrOpen = true"><QrCode /> QR</Button>
    </div>

    <section v-if="checks.length" class="space-y-2">
      <CheckItem v-for="(c, i) in checks" :key="i" :check="c" compact />
    </section>

    <section v-if="device.smart">
      <h3 class="section-title">{{ t('smart.title') }} · {{ t(`smart.system.${device.smart.system}`) }}<template v-if="device.smart.address"> · {{ device.smart.address }}</template></h3>
      <div v-if="device.smart.channels.length" class="divide-y rounded-xl border">
        <div v-for="ch in device.smart.channels" :key="ch.id" class="flex items-start gap-3 px-3.5 py-2.5 text-sm">
          <span class="w-6 font-mono font-semibold">{{ ch.id }}</span>
          <div class="min-w-0 flex-1">
            <div>{{ tx(ch.label) || ch.points.map((pid) => tx(data.data?.points.find((p) => p.id === pid)?.label, pid)).join(', ') || '—' }}</div>
            <div class="text-xs text-muted-foreground">{{ t(`smart.fn.${ch.function}`) }}</div>
          </div>
          <span v-if="ch.group" class="font-mono text-xs text-green-700 dark:text-green-400">{{ ch.group }}</span>
        </div>
      </div>
    </section>

    <section v-if="specs.length">
      <h3 class="section-title">{{ t('device.specs') }}</h3>
      <dl class="divide-y rounded-xl border">
        <div v-for="[k, v] in specs" :key="k" class="flex justify-between gap-4 px-3.5 py-2.5 text-sm">
          <dt class="text-muted-foreground">{{ k }}</dt>
          <dd class="text-right font-medium">{{ v }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="load && load.nameplateW > 0">
      <h3 class="section-title">{{ t('device.load') }}</h3>
      <div class="rounded-xl border p-3.5">
        <div class="mb-2 flex items-baseline justify-between text-sm">
          <span>
            <span class="text-lg font-semibold tabular">{{ load.currentA.toFixed(1) }}</span>
            <span class="text-muted-foreground"> / {{ device.rating ?? '—' }} A</span>
          </span>
          <span v-if="device.rating" class="font-mono text-sm tabular">{{ utilPct }}%</span>
        </div>
        <div v-if="device.rating" class="h-2 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full transition-[width] duration-700" :class="utilTone" :style="{ width: `${Math.min(100, utilPct)}%` }" />
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          {{ t('device.loadHint', { demand: (load.demandW / 1000).toFixed(2), nameplate: (load.nameplateW / 1000).toFixed(2) }) }}
        </p>
      </div>
    </section>

    <section v-if="points.length">
      <h3 class="section-title">{{ t('device.powers', { n: points.length }) }}</h3>
      <div class="mb-3 aspect-[3/2] overflow-hidden rounded-xl border bg-muted/30">
        <FloorPlan :highlight-points="pointIds" :interactive="false" mini all-layers :show-routes="false" @point="(pid) => router.push({ path: '/plan', query: { point: pid } })" />
      </div>
      <div class="space-y-3">
        <div v-for="g in byRoom" :key="g.room">
          <div class="mb-1 text-xs font-medium text-muted-foreground">{{ g.name }}</div>
          <ul class="space-y-1">
            <li v-for="p in g.pts" :key="p.id">
              <RouterLink :to="{ path: '/plan', query: { point: p.id } }" class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <component :is="POINT_ICONS[p.kind]" class="size-4 text-muted-foreground" />
                <span class="flex-1">{{ tx(p.label, t(`point.kind.${p.kind}`)) }}</span>
                <span v-if="p.device !== id" class="font-mono text-xs text-muted-foreground">{{ p.device }}</span>
                <span v-if="p.powerW" class="font-mono text-xs text-muted-foreground tabular">{{ (p.powerW * p.count) >= 1000 ? `${((p.powerW * p.count) / 1000).toFixed(1)} kW` : `${p.powerW * p.count} W` }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="upstream.length || children.length" class="grid gap-4 sm:grid-cols-2">
      <div v-if="upstream.length">
        <h3 class="section-title flex items-center gap-1.5"><ArrowUpFromLine class="size-3.5" /> {{ t('device.fedFrom') }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="u in upstream" :key="u.id" @click="ui.select(u.id)"><DeviceChip :device="u" /></button>
        </div>
      </div>
      <div v-if="children.length">
        <h3 class="section-title flex items-center gap-1.5"><ArrowDownToLine class="size-3.5" /> {{ t('device.feeds') }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="c in children" :key="c.id" @click="ui.select(c.id)"><DeviceChip :device="c" /></button>
        </div>
      </div>
    </section>

    <section v-if="terminalRows.length">
      <h3 class="section-title">{{ t('editor.terminals.title') }}</h3>
      <table class="w-full text-sm">
        <tbody>
          <tr v-for="r in terminalRows" :key="r.tt.id" class="border-t first:border-t-0">
            <td class="py-1 pr-2 font-mono">{{ r.tt.id }}</td>
            <td class="py-1 pr-2 text-xs text-muted-foreground">{{ t(`editor.terminals.role.${r.tt.role}`) }}{{ r.tt.group ? ` · ${r.tt.group}` : '' }}</td>
            <td class="py-1 pr-2 font-mono text-xs">{{ r.tt.conductor ?? '' }}</td>
            <td class="py-1 text-right">
              <button v-for="l in r.links" :key="l.ref" class="ml-1 font-mono text-xs underline-offset-2 hover:underline" @click="ui.select(l.device)">{{ l.ref }}</button>
              <span v-if="!r.links.length" class="text-xs text-muted-foreground">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="section-title mb-0">{{ t('device.notes') }}</h3>
        <Button v-if="!noteOpen && !viewerOnly" variant="ghost" size="sm" @click="noteOpen = true"><MessageSquarePlus /> {{ t('device.addNote') }}</Button>
      </div>
      <div v-if="noteOpen" class="mb-3 space-y-2 rounded-xl border p-3">
        <input v-model="noteAuthor" class="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-sm" :placeholder="t('device.noteAuthor')" />
        <Textarea v-model="noteText" rows="3" :placeholder="t('device.notePlaceholder')" />
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-muted-foreground">{{ t('device.noteDraftHint') }}</p>
          <Button size="sm" :disabled="!noteText.trim()" @click="addNote"><Send /> {{ t('common.save') }}</Button>
        </div>
      </div>
      <ol v-if="device.notes.length" class="space-y-2">
        <li v-for="(n, i) in [...device.notes].reverse()" :key="i" class="rounded-xl bg-muted/50 p-3 text-sm">
          <div class="mb-1 flex justify-between text-xs text-muted-foreground">
            <span class="font-medium">{{ n.author || t('device.anonymous') }}</span>
            <time>{{ n.date }}</time>
          </div>
          <MarkdownText :text="n.text" />
        </li>
      </ol>
      <p v-else-if="!noteOpen" class="text-sm text-muted-foreground">{{ t('device.noNotes') }}</p>
    </section>

    <QrDialog v-if="qrUsed" v-model:open="qrOpen" :path="`/d/${id}`" :title="`${device.id} · ${tx(device.label)}`" />
  </div>
</template>

<style scoped>
@reference "../../style.css";
.section-title {
  @apply mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase;
}
</style>
