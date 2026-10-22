<script setup lang="ts">
import { isoDay } from '@/domain/maintenance'
import { computed, ref, watch } from 'vue'
import { CalendarClock, Plus, Trash2, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BLOCK_COLORS, DEVICE_TYPES, SMART_TYPES, type Device } from '@/domain/model'
import { findItem, renameDevice } from '@/editor/ops'
import { joinTemplateTask, templateFor } from '@/editor/taskTemplates'
import { useDraft } from '@/composables/useDraft'
import { useText } from '@/composables/useText'
import { useUi } from '@/stores/ui'
import FormRow from './FormRow.vue'
import LocalizedInput from './LocalizedInput.vue'
import MarkdownTextarea from './MarkdownTextarea.vue'
import NumberInput from './NumberInput.vue'
import SmartForm from './SmartForm.vue'
import TerminalsForm from './TerminalsForm.vue'
import { buildTerminalIndex, effectiveUpstream, feedGroups } from '@/domain/terminals'
import { POSITION_OFF } from '@/domain/model'

const props = defineProps<{ id: string }>()
const { d } = useDraft()
// resolved from the draft instead of passed in, so the form edits the store directly
const device = computed(() => d.value.devices.find((x) => x.id === props.id)!)
const placed = computed(() => !!findItem(d.value, props.id))
const tasks = computed(() => d.value.maintenance.tasks.filter((x) => x.devices.includes(props.id)))
const template = computed(() => {
  const tpl = templateFor(device.value.type)
  return tpl && !tasks.value.some((x) => x.id === tpl.id) ? tpl : undefined
})
const templateExists = computed(() => !!template.value && d.value.maintenance.tasks.some((x) => x.id === template.value!.id))
const ui = useUi()
const { t, tx } = useText()

const idDraft = ref(device.value.id)
watch(
  () => device.value.id,
  (v) => (idDraft.value = v),
)

function commitId() {
  idDraft.value = idDraft.value.trim()
  if (idDraft.value === device.value.id) return
  const old = device.value.id
  if (renameDevice(d.value, old, idDraft.value)) ui.select(idDraft.value)
  else {
    toast.error(t('editor.panel.idTaken'))
    idDraft.value = old
  }
}

// a feeder named by terminal links overrides the hand-set one, so the select gives way to a read-only line
const derivedUpstream = computed(() => {
  const idx = buildTerminalIndex(d.value.devices)
  return idx.feeds.has(device.value.id) ? effectiveUpstream(device.value, idx) : undefined
})
const groups = computed(() => feedGroups(device.value))

const isRcd = computed(() => device.value.type === 'rcd' || device.value.type === 'rcbo')
const hasCurve = computed(() => device.value.type === 'mcb' || device.value.type === 'rcbo')
const tagsText = computed({
  get: () => device.value.tags.join(', '),
  set: (v: string) => (device.value.tags = v.split(',').map((s) => s.trim()).filter(Boolean)),
})

const upstreamOptions = computed(() => {
  const banned = new Set([device.value.id])
  let grew = true
  while (grew) {
    grew = false
    for (const x of d.value.devices) {
      if (x.upstream && banned.has(x.upstream) && !banned.has(x.id)) {
        banned.add(x.id)
        grew = true
      }
    }
  }
  // terminal blocks distribute a feed to several devices, so they are valid feeders; busbars stay out
  return d.value.devices.filter((x) => !banned.has(x.id) && x.type !== 'bus')
})

function circuit() {
  if (!device.value.circuit) device.value.circuit = {}
  return device.value.circuit
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <FormRow :label="t('editor.panel.label')"><LocalizedInput v-model="device.label" :placeholder="t('editor.panel.labelPlaceholder')" /></FormRow>
      <div class="grid grid-cols-2 gap-3">
        <FormRow :label="t('editor.panel.id')">
          <Input v-model="idDraft" class="font-mono" placeholder="QF1" @blur="commitId" @keydown.enter="commitId" />
        </FormRow>
        <FormRow :label="t('editor.panel.type')">
          <Select v-model="device.type">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="tp in DEVICE_TYPES" :key="tp" :value="tp">{{ t(`device.type.${tp}`) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="section-title">{{ t('editor.panel.section.specs') }}</h3>
      <div class="grid grid-cols-2 gap-3">
        <FormRow :label="t('device.field.rating')"><NumberInput v-model="device.rating" optional suffix="A" /></FormRow>
        <FormRow v-if="hasCurve" :label="t('editor.panel.curve')">
          <Select :model-value="device.curve ?? '__'" @update:model-value="(v) => (device.curve = v === '__' ? undefined : (v as Device['curve']))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">—</SelectItem>
              <SelectItem v-for="c in ['B', 'C', 'D', 'K', 'Z']" :key="c" :value="c">{{ c }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('device.field.poles')">
          <Select :model-value="String(device.poles)" @update:model-value="(v) => (device.poles = Number(v))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1P</SelectItem>
              <SelectItem value="2">1P+N / 2P</SelectItem>
              <SelectItem value="3">3P</SelectItem>
              <SelectItem value="4">3P+N / 4P</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.panel.width')"><NumberInput v-model="device.width" optional :max="12" :placeholder="t('editor.auto')" /></FormRow>
        <FormRow v-if="device.type === 'distribution-block'" :label="t('editor.panel.color')">
          <Select :model-value="device.color ?? '__'" @update:model-value="(v) => (device.color = v === '__' ? undefined : (v as string))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">{{ t('editor.colorAuto') }}</SelectItem>
              <SelectItem v-for="c in Object.keys(BLOCK_COLORS)" :key="c" :value="c">{{ t(`editor.color.${c}`) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <template v-if="isRcd">
          <FormRow :label="t('device.field.leakage')"><NumberInput v-model="device.leakage" optional suffix="mA" /></FormRow>
          <FormRow :label="t('editor.panel.rcdClass')">
            <Select :model-value="device.rcdClass ?? '__'" @update:model-value="(v) => (device.rcdClass = v === '__' ? undefined : (v as Device['rcdClass']))">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__">—</SelectItem>
                <SelectItem v-for="c in ['AC', 'A', 'F', 'B']" :key="c" :value="c">{{ c }}</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
          <label class="col-span-2 flex items-center gap-2 text-sm"><Switch :model-value="!!device.selective" @update:model-value="(v) => (device.selective = v || undefined)" /> {{ t('editor.panel.selective') }}</label>
        </template>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="section-title">{{ t('editor.panel.section.wiring') }}</h3>
      <FormRow v-if="!placed || device.location" :label="t('editor.panel.location')">
        <LocalizedInput v-model="device.location" multiline :placeholder="t('editor.panel.locationPlaceholder')" />
      </FormRow>
      <FormRow v-if="derivedUpstream" :label="t('editor.panel.upstream')">
        <div class="rounded-md border px-3 py-2 text-sm"><span class="font-mono">{{ derivedUpstream }}</span> <span class="text-xs text-muted-foreground">· {{ t('editor.terminals.fromLinks') }}</span></div>
      </FormRow>
      <FormRow v-if="groups.length > 1" :label="t('editor.terminals.position')">
        <Select :model-value="device.position ?? '__'" @update:model-value="(v) => (device.position = v === '__' ? undefined : (v as string))">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__">—</SelectItem>
            <SelectItem v-for="g in groups" :key="g" :value="g">{{ g }}</SelectItem>
            <SelectItem :value="POSITION_OFF">{{ t('editor.terminals.positionOff') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormRow>
      <FormRow v-else-if="!derivedUpstream" :label="t('editor.panel.upstream')">
        <Select :model-value="device.upstream ?? '__'" @update:model-value="(v) => (device.upstream = v === '__' ? undefined : (v as string))">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__">{{ t('editor.panel.noUpstream') }}</SelectItem>
            <SelectItem v-for="u in upstreamOptions" :key="u.id" :value="u.id">{{ u.id }} · {{ tx(u.label) || t(`device.type.${u.type}`) }}</SelectItem>
          </SelectContent>
        </Select>
      </FormRow>
      <FormRow v-if="d.supply.phases === 3" :label="t('device.field.phase')">
        <Select :model-value="device.phase ?? '__'" @update:model-value="(v) => (device.phase = v === '__' ? undefined : (v as Device['phase']))">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__">—</SelectItem>
            <SelectItem v-for="p in ['L1', 'L2', 'L3', 'L1L2L3']" :key="p" :value="p">{{ p }}</SelectItem>
          </SelectContent>
        </Select>
      </FormRow>
      <FormRow :label="t('device.field.cable')"><Input :model-value="device.circuit?.cable ?? ''" placeholder="ВВГнг(А)-LS 3×2.5" @update:model-value="(v) => (circuit().cable = String(v) || undefined)" /></FormRow>
      <div class="grid grid-cols-2 gap-3">
        <FormRow :label="t('device.field.section')">
          <Select :model-value="device.circuit?.crossSection ? String(device.circuit.crossSection) : '__'" @update:model-value="(v) => (circuit().crossSection = v === '__' ? undefined : Number(v))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">—</SelectItem>
              <SelectItem v-for="s in [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35]" :key="s" :value="String(s)">{{ s }} {{ t('units.mm2') }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('device.field.length')"><NumberInput :model-value="device.circuit?.lengthM" optional allow-zero :suffix="t('units.m')" @update:model-value="(v) => (circuit().lengthM = v)" /></FormRow>
      </div>
    </section>

    <TerminalsForm :id="device.id" />

    <SmartForm v-if="SMART_TYPES.includes(device.type) || device.smart" :id="device.id" />

    <section class="space-y-3">
      <h3 class="section-title">{{ t('editor.panel.section.passport') }}</h3>
      <div class="grid grid-cols-2 gap-3">
        <FormRow :label="t('editor.panel.brand')"><Input :model-value="device.brand ?? ''" placeholder="ABB" @update:model-value="(v) => (device.brand = String(v) || undefined)" /></FormRow>
        <FormRow :label="t('editor.panel.model')"><Input :model-value="device.model ?? ''" placeholder="S201 C16" @update:model-value="(v) => (device.model = String(v) || undefined)" /></FormRow>
        <FormRow v-if="device.type === 'meter' || device.serial" :label="t('device.field.serial')" class="col-span-2">
          <Input :model-value="device.serial ?? ''" class="font-mono" @update:model-value="(v) => (device.serial = String(v) || undefined)" />
        </FormRow>
      </div>
      <FormRow :label="t('editor.panel.tags')"><Input v-model="tagsText" :placeholder="t('editor.panel.tagsPlaceholder')" /></FormRow>
    </section>

    <section v-if="tasks.length || template" class="space-y-2">
      <h3 class="section-title">{{ t('editor.panel.section.maintenance') }}</h3>
      <div v-for="task in tasks" :key="task.id" class="flex items-center gap-2 rounded-xl border px-3 py-2">
        <CalendarClock class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ tx(task.title) }}</span>
        <div class="w-28 shrink-0"><NumberInput v-model="task.intervalDays" integer :suffix="t('units.days')" /></div>
        <Button variant="ghost" size="icon-sm" :aria-label="t('editor.panel.leaveTask')" @click="task.devices.splice(task.devices.indexOf(device.id), 1)"><X /></Button>
      </div>
      <div v-if="template" class="flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-3 py-2.5">
        <CalendarClock class="size-4 shrink-0 text-primary" />
        <div class="min-w-0 flex-1 text-sm">
          <div class="font-medium">{{ tx(template.title) }}</div>
          <div class="text-xs text-muted-foreground">{{ t('maintenance.every', { n: template.intervalDays }) }} · {{ t('editor.panel.suggestTask') }}</div>
        </div>
        <Button size="sm" variant="outline" class="shrink-0" @click="joinTemplateTask(d, template, device.id)">
          <Plus /> {{ t(templateExists ? 'editor.panel.joinTask' : 'editor.panel.createTask') }}
        </Button>
      </div>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="section-title">{{ t('device.notes') }}</h3>
        <Button variant="ghost" size="sm" class="h-7" @click="device.notes.push({ author: '', date: isoDay(new Date()), text: '' })"><Plus /> {{ t('common.add') }}</Button>
      </div>
      <div v-for="(n, i) in device.notes" :key="i" class="space-y-2 rounded-xl border p-3">
        <div class="flex gap-2">
          <Input v-model="n.author" :placeholder="t('device.noteAuthor')" class="min-w-0 flex-1" />
          <Input v-model="n.date" type="date" class="w-36" />
          <Button variant="ghost" size="icon" class="shrink-0" :aria-label="t('common.delete')" @click="device.notes.splice(i, 1)"><Trash2 /></Button>
        </div>
        <MarkdownTextarea v-model="n.text" :rows="2" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.section-title {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
</style>
