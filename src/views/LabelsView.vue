<script setup lang="ts">
import { computed, ref } from 'vue'
import { Printer, TriangleAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import QrCode from '@/components/common/QrCode.vue'
import { useText } from '@/composables/useText'
import { refKey } from '@/domain/terminals'
import { appUrl } from '@/lib/appUrl'
import { printPage } from '@/platform'
import { useData } from '@/stores/data'

const data = useData()
const { t, tx } = useText()
const withKey = ref(true)
const perDeviceQr = ref(false)
const showLabels = ref(true)
const showTerminalPlan = ref(false)
// millimetres; one DIN module is 17.5 mm
const MODULE_MM = 17.5
const labelHeight = ref(14)
// an 18-module row is 315 mm, wider than A4 even in landscape; 10 modules (175 mm) fit the 190 mm
// printable width of portrait A4 with 10 mm margins, so rows are cut into pieces at device boundaries
const PIECE_MODULES = 10

const pieces = computed(() =>
  data.layout.map((row) => {
    const out: (typeof row.items)[] = [[]]
    let width = 0
    for (const item of row.items) {
      if (width + item.width > PIECE_MODULES && out.at(-1)!.length) {
        out.push([])
        width = 0
      }
      out.at(-1)!.push(item)
      width += item.width
    }
    return out.filter((p) => p.length)
  }),
)

const mainUrl = computed(() => appUrl(data.data?.meta.publicUrl, '/', withKey.value ? data.password : null))
const deviceUrl = (id: string) => appUrl(data.data?.meta.publicUrl, `/d/${id}`, withKey.value ? data.password : null)
const noBase = computed(() => !mainUrl.value.startsWith('http'))

// one table per device with entered terminals; a link is stored on one end, the index shows it from both
const terminalPlan = computed(() =>
  (data.data?.devices ?? [])
    .filter((d) => d.terminals.length)
    .map((d) => ({
      device: d,
      rows: d.terminals.map((tt) => ({
        terminal: tt,
        links: (data.graph?.terminals.links.get(refKey(d.id, tt.id)) ?? []).map((o) => refKey(o.device.id, o.terminal.id)),
      })),
    })),
)

function print() {
  void printPage()
}

function rating(id: string) {
  const d = data.graph?.byId.get(id)
  if (!d?.rating) return ''
  return `${d.curve ?? ''}${d.rating}${d.leakage ? ` ${d.leakage}mA` : ''}`
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pt-5 lg:px-8 lg:pt-8 print:max-w-none print:p-0">
    <div class="no-print">
      <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">{{ t('labels.title') }}</h1>
      <p class="mt-1 text-muted-foreground">{{ t('labels.subtitle') }}</p>

      <div data-tour="labels-options" class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border bg-card p-4">
        <label class="flex items-center gap-2 text-sm"><Switch v-model="withKey" /> {{ t('qr.withPassword') }}</label>
        <label class="flex items-center gap-2 text-sm"><Switch v-model="showLabels" /> {{ t('labels.strips') }}</label>
        <label class="flex items-center gap-2 text-sm"><Switch v-model="perDeviceQr" /> {{ t('labels.perDevice') }}</label>
        <label v-if="terminalPlan.length" class="flex items-center gap-2 text-sm"><Switch v-model="showTerminalPlan" /> {{ t('labels.terminalPlan') }}</label>
        <label class="flex items-center gap-2 text-sm">
          {{ t('labels.height') }}
          <input v-model.number="labelHeight" type="number" min="8" max="30" class="w-16 rounded-md border bg-transparent px-2 py-1 text-sm" />
          {{ t('units.mm') }}
        </label>
        <div class="flex-1" />
        <Button data-tour="labels-print" @click="print"><Printer /> {{ t('labels.print') }}</Button>
      </div>
      <p v-if="noBase" class="mt-3 flex gap-2 rounded-xl bg-warn/15 p-3 text-sm"><TriangleAlert class="size-4 shrink-0 text-warn" />{{ t('qr.noPublicUrl') }}</p>
      <p class="mt-3 text-xs text-muted-foreground">{{ t('labels.printHint') }}</p>
    </div>

    <div class="print-area mt-6 space-y-8">
      <section data-tour="labels-sticker" class="sticker mx-auto flex w-[90mm] flex-col items-center gap-[3mm] rounded-[4mm] border-[0.6mm] border-black bg-white p-[5mm] text-black">
        <div class="text-center text-[4.2mm] leading-tight font-semibold">{{ tx(data.data?.meta.title) }}</div>
        <div class="size-[60mm]"><QrCode :value="mainUrl" :margin="0" /></div>
        <div class="text-center text-[3mm] leading-snug">{{ t('labels.scan') }}</div>
        <div class="flex w-full justify-between text-[2.4mm] text-neutral-600">
          <span>⚡ {{ t('labels.emergencyLine') }}</span>
          <span v-if="data.data?.meta.contacts[0]?.phone">{{ data.data.meta.contacts[0].phone }}</span>
        </div>
      </section>

      <section v-if="showLabels" class="space-y-[5mm]">
        <template v-for="(row, ri) in pieces" :key="ri">
          <div v-for="(piece, pi) in row" :key="pi" class="strip-wrap mx-auto w-max max-w-full overflow-x-auto">
            <div class="mb-1 text-xs text-muted-foreground print:text-[2.4mm] print:text-neutral-500">
              {{ t('labels.row', { n: ri + 1 }) }}<template v-if="row.length > 1"> · {{ pi + 1 }}/{{ row.length }}</template>
            </div>
            <div class="flex w-max bg-white text-black">
              <div
                v-for="item in piece"
                :key="item.device?.id ?? `b${item.start}`"
                class="flex shrink-0 flex-col items-center justify-center overflow-hidden border-[0.25mm] border-black/70 px-[0.6mm] text-center"
                :style="{ width: `${item.width * MODULE_MM}mm`, height: `${labelHeight}mm` }"
              >
                <template v-if="item.device">
                  <div class="font-mono text-[2.8mm] leading-none font-bold">{{ item.device.id }}</div>
                  <div class="mt-[0.5mm] line-clamp-2 text-[1.9mm] leading-[1.1]">{{ tx(item.device.label) }}</div>
                  <div class="font-mono text-[1.8mm] leading-none text-neutral-600">{{ rating(item.device.id) }}</div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </section>

      <section v-if="showTerminalPlan && terminalPlan.length" class="space-y-[4mm] bg-white p-[2mm] text-black">
        <h2 class="text-[4mm] font-semibold">{{ t('labels.terminalPlan') }} · {{ tx(data.data?.meta.title) }}</h2>
        <table v-for="p in terminalPlan" :key="p.device.id" class="plan w-full border-collapse text-[2.6mm]">
          <caption class="pb-[1mm] text-left text-[3mm] font-semibold">
            <span class="font-mono">{{ p.device.id }}</span> · {{ tx(p.device.label) }}
          </caption>
          <thead>
            <tr>
              <th>{{ t('editor.terminals.id') }}</th>
              <th />
              <th>{{ t('editor.terminals.conductor') }}</th>
              <th>{{ t('editor.terminals.to') }}</th>
              <th>{{ t('device.field.section') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in p.rows" :key="r.terminal.id">
              <td class="font-mono">{{ r.terminal.id }}</td>
              <td>{{ t(`editor.terminals.${r.terminal.side}`) }} · {{ t(`editor.terminals.role.${r.terminal.role}`) }}</td>
              <td>{{ r.terminal.conductor ?? '' }}</td>
              <td class="font-mono">{{ r.links.join(', ') || '—' }}</td>
              <td>{{ r.terminal.crossSection ? `${r.terminal.crossSection} ${t('units.mm2')}` : '' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="perDeviceQr" class="grid grid-cols-[repeat(auto-fill,minmax(28mm,1fr))] gap-[3mm]">
        <div v-for="d in data.data?.devices.filter((x) => x.type !== 'bus' && x.type !== 'terminal')" :key="d.id" class="flex flex-col items-center gap-[1mm] rounded-[2mm] border-[0.3mm] border-black bg-white p-[2mm] text-black">
          <div class="size-[22mm]"><QrCode :value="deviceUrl(d.id)" :margin="0" /></div>
          <div class="font-mono text-[2.8mm] font-bold">{{ d.id }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
@media print {
  .print-area {
    margin: 0;
  }
  .sticker,
  .strip-wrap,
  .plan {
    break-inside: avoid;
  }
  .strip-wrap {
    overflow: visible;
  }
}
.plan th,
.plan td {
  border: 0.2mm solid rgb(0 0 0 / 0.5);
  padding: 0.6mm 1.2mm;
  text-align: left;
}
</style>
