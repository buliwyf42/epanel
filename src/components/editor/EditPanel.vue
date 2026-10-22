<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, SquareDashed, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import DeviceChip from '@/components/common/DeviceChip.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import PanelEnclosure from '@/components/panel/PanelEnclosure.vue'
import PanelViewToggle from '@/components/panel/PanelViewToggle.vue'
import type { DeviceType } from '@/domain/model'
import { addDevice, addRow, feederAt, findItem, insertBlank, moveItem, moveToRow, placeAt, removeDevice, removeRow } from '@/editor/ops'
import { useDraft } from '@/composables/useDraft'
import { useText } from '@/composables/useText'
import { useUi } from '@/stores/ui'
import DeviceForm from './DeviceForm.vue'
import DeviceTypePicker from './DeviceTypePicker.vue'
import NumberInput from './NumberInput.vue'

const { d, data } = useDraft()
const ui = useUi()
const { t, tx } = useText()

const selected = computed(() => d.value.devices.find((x) => x.id === ui.selectedDevice))
const loc = computed(() => (selected.value ? findItem(d.value, selected.value.id) : undefined))
const unplaced = computed(() => d.value.devices.filter((x) => !findItem(d.value, x.id)))

// the slot the user clicked "+" on; the aside then asks what goes there
const slot = ref<{ row: number; index: number } | null>(null)
const slotFree = computed(() => {
  const s = slot.value
  if (!s) return 0
  const blank = d.value.rows[s.row]?.items[s.index]
  return blank && typeof blank !== 'string' ? blank.blank : (d.value.rows[s.row]?.modules ?? 0) - used(s.row)
})
watch(
  () => ui.selectedDevice,
  (id) => id && (slot.value = null),
)

function openSlot(row: number, index: number) {
  ui.select(null)
  slot.value = { row, index }
}

// breakers placed right of an RCD are fed by it, the way panels are usually wired
const FED_TYPES: DeviceType[] = ['mcb', 'afdd', 'fuse', 'neozed', 'din-socket', 'contactor', 'impulse-relay', 'time-relay', 'dimmer', 'actuator', 'switch']

function add(type: DeviceType) {
  const s = slot.value
  if (!s) return
  const dev = addDevice(d.value, type, -1)
  placeAt(d.value, dev.id, s.row, s.index)
  if (FED_TYPES.includes(type)) dev.upstream = feederAt(d.value, s.row, s.index)
  slot.value = null
  ui.select(dev.id)
}

const moves = computed(() => {
  const l = loc.value
  const id = selected.value?.id
  if (!l || !id) return []
  return [
    { key: 'editor.panel.left', icon: ArrowLeft, disabled: l.index === 0, run: () => moveItem(d.value, l.row, l.index, -1) },
    { key: 'editor.panel.right', icon: ArrowRight, disabled: l.index >= (d.value.rows[l.row]?.items.length ?? 0) - 1, run: () => moveItem(d.value, l.row, l.index, 1) },
    { key: 'editor.panel.rowUp', icon: ArrowUp, disabled: l.row === 0, run: () => moveToRow(d.value, id, l.row - 1) },
    { key: 'editor.panel.rowDown', icon: ArrowDown, disabled: l.row >= d.value.rows.length - 1, run: () => moveToRow(d.value, id, l.row + 1) },
  ]
})

function remove() {
  if (!selected.value) return
  removeDevice(d.value, selected.value.id)
  ui.select(null)
}

function used(i: number) {
  return data.layout[i]?.used ?? 0
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
    <div class="min-w-0 space-y-4">
      <PanelViewToggle data-tour="epanel-view" />

      <div v-if="ui.panelView === 'visual'" data-tour="epanel-board" class="overflow-x-auto rounded-2xl">
        <div class="mx-auto max-w-[900px]">
          <PanelEnclosure addable :active-slot="slot" @select="(id) => ui.select(ui.selectedDevice === id ? null : id)" @add="openSlot" />
        </div>
      </div>

      <div class="space-y-2">
        <template v-if="ui.panelView === 'list'">
        <div v-for="(row, ri) in d.rows" :key="row.id" class="rounded-xl border bg-card p-3">
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <span class="text-sm font-medium">{{ t('labels.row', { n: ri + 1 }) }}</span>
            <span class="text-xs text-muted-foreground" :class="{ 'text-danger': used(ri) > row.modules }">{{ t('editor.panel.used', { used: used(ri), total: row.modules }) }}</span>
            <div class="w-28"><NumberInput v-model="row.modules" integer :max="48" :suffix="t('editor.panel.mod')" /></div>
            <div class="flex-1" />
            <Button variant="ghost" size="icon-sm" :aria-label="t('common.delete')" :disabled="row.items.length > 0" @click="removeRow(d, ri)"><Trash2 /></Button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <template v-for="(it, ii) in row.items" :key="ii">
              <button v-if="typeof it === 'string'" :class="{ 'ring-2 ring-primary rounded-md': ui.selectedDevice === it }" @click="ui.select(it)">
                <DeviceChip :device="d.devices.find((x) => x.id === it) ?? { id: it, type: 'other' }" size="sm" />
              </button>
              <span v-else class="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 text-[11px] text-muted-foreground">
                <SquareDashed class="size-3" />
                <button :aria-label="t('editor.panel.narrower')" @click="it.blank > 1 ? (it.blank -= 1) : row.items.splice(ii, 1)"><Minus class="size-3" /></button>
                {{ it.blank }}
                <button :aria-label="t('editor.panel.wider')" @click="it.blank += 1"><Plus class="size-3" /></button>
              </span>
            </template>
            <button
              class="rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:text-foreground"
              :class="{ 'border-primary text-primary': slot?.row === ri && slot.index === row.items.length }"
              @click="openSlot(ri, row.items.length)"
            >
              + {{ t('editor.panel.device') }}
            </button>
            <button class="rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:text-foreground" @click="insertBlank(d, ri, row.items.length)">+ {{ t('editor.panel.blank') }}</button>
          </div>
        </div>
        </template>
        <Button variant="outline" size="sm" data-tour="epanel-addrow" @click="addRow(d)"><Plus /> {{ t('editor.panel.addRow') }}</Button>
      </div>

      <div v-if="unplaced.length" class="rounded-xl border border-warn/40 bg-warn/10 p-3">
        <div class="mb-2 text-sm font-medium">{{ t('editor.panel.unplaced') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="u in unplaced" :key="u.id" @click="ui.select(u.id)"><DeviceChip :device="u" size="sm" /></button>
        </div>
      </div>
    </div>

    <aside data-tour="epanel-aside" class="space-y-4">
      <div v-if="selected" class="rounded-2xl border bg-card p-4">
        <div class="mb-4 flex items-start gap-3">
          <DeviceChip :device="selected" size="lg" />
          <div class="min-w-0 flex-1 pt-0.5">
            <div class="truncate font-medium">{{ tx(selected.label) || t(`device.type.${selected.type}`) }}</div>
            <div class="text-xs text-muted-foreground">
              <template v-if="loc">{{ t('device.place', { row: loc.row + 1, pos: (data.layout[loc.row]?.items.find((i) => i.device?.id === selected!.id)?.position ?? loc.index + 1) }) }}</template>
              <template v-else>{{ t('editor.panel.unplacedOne') }}</template>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-danger" :aria-label="t('common.delete')" @click="remove"><Trash2 /></Button>
        </div>
        <div v-if="loc" class="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-1.5">
          <div class="flex" role="group" :aria-label="t('editor.panel.position')">
            <Tooltip v-for="m in moves" :key="m.key">
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon-sm" :disabled="m.disabled" :aria-label="t(m.key)" @click="m.run()"><component :is="m.icon" /></Button>
              </TooltipTrigger>
              <TooltipContent>{{ t(m.key) }}</TooltipContent>
            </Tooltip>
          </div>
          <div class="h-5 w-px bg-border" />
          <Button variant="ghost" size="sm" class="h-7" @click="insertBlank(d, loc.row, loc.index)"><SquareDashed /> {{ t('editor.panel.blankShort') }}</Button>
          <Button variant="ghost" size="sm" class="h-7" @click="openSlot(loc.row, loc.index + 1)"><Plus /> {{ t('editor.panel.insertRight') }}</Button>
        </div>
        <Button v-else variant="outline" size="sm" class="mb-5" @click="moveToRow(d, selected.id, Math.max(0, d.rows.length - 1))">{{ t('editor.panel.place') }}</Button>
        <DeviceForm :id="selected.id" :key="selected.id" />
      </div>
      <div v-else class="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
        <p class="mb-2 flex items-center gap-2 font-medium text-foreground">
          <span class="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Plus class="size-3.5" /></span>
          {{ t('editor.panel.howAdd') }}
        </p>
        <p>{{ t('editor.panel.pick') }}</p>
      </div>
    </aside>

    <DeviceTypePicker v-if="slot" :open="!!slot" :row="slot.row" :free="slotFree" @update:open="(v) => !v && (slot = null)" @pick="add" />
  </div>
</template>
