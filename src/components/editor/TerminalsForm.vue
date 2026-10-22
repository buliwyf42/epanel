<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CONDUCTORS, TERMINAL_ROLES, type Terminal } from '@/domain/model'
import { buildTerminalIndex, defaultTerminals, refKey } from '@/domain/terminals'
import { useDraft } from '@/composables/useDraft'
import { useText } from '@/composables/useText'
import FormRow from './FormRow.vue'

const props = defineProps<{ id: string }>()
const { d } = useDraft()
const { t } = useText()
const device = computed(() => d.value.devices.find((x) => x.id === props.id)!)
const index = computed(() => buildTerminalIndex(d.value.devices))

// every terminal of every other device; a bus terminal takes many links, so nothing is filtered out
const targets = computed(() =>
  d.value.devices
    .filter((x) => x.id !== props.id)
    .flatMap((x) => x.terminals.map((tt) => ({ value: refKey(x.id, tt.id), label: `${x.id} · ${tt.id}${tt.conductor ? ` (${tt.conductor})` : ''}` }))),
)

// links stored on the other end, shown so the terminal does not look free
function linkedFrom(tt: Terminal): string[] {
  return (index.value.links.get(refKey(props.id, tt.id)) ?? []).map((o) => refKey(o.device.id, o.terminal.id)).filter((r) => r !== tt.to)
}

function addTerminal() {
  const n = device.value.terminals.length + 1
  device.value.terminals.push({ id: String(n), side: 'top', role: 'in' })
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="section-title">{{ t('editor.terminals.title') }}</h3>
      <div class="flex gap-1">
        <Button v-if="!device.terminals.length" variant="ghost" size="sm" class="h-7" @click="device.terminals = defaultTerminals(device)">{{ t('editor.terminals.fromTemplate') }}</Button>
        <Button variant="ghost" size="sm" class="h-7" @click="addTerminal"><Plus /> {{ t('common.add') }}</Button>
      </div>
    </div>
    <p v-if="!device.terminals.length" class="text-xs text-muted-foreground">{{ t('editor.terminals.empty') }}</p>
    <div v-for="(tt, i) in device.terminals" :key="i" class="space-y-2 rounded-xl border p-3">
      <div class="grid grid-cols-[4.5rem_1fr_1fr_auto] gap-2">
        <Input v-model="tt.id" class="font-mono" :aria-label="t('editor.terminals.id')" />
        <Select v-model="tt.role">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="r in TERMINAL_ROLES" :key="r" :value="r">{{ t(`editor.terminals.role.${r}`) }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="tt.side">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top">{{ t('editor.terminals.top') }}</SelectItem>
            <SelectItem value="bottom">{{ t('editor.terminals.bottom') }}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" class="shrink-0" :aria-label="t('common.delete')" @click="device.terminals.splice(i, 1)"><Trash2 /></Button>
      </div>
      <FormRow :label="t('editor.terminals.to')">
        <Select :model-value="tt.to ?? '__'" @update:model-value="(v) => (tt.to = v === '__' ? undefined : (v as string))">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__">{{ t('editor.terminals.none') }}</SelectItem>
            <SelectItem v-for="o in targets" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
          </SelectContent>
        </Select>
      </FormRow>
      <p v-if="linkedFrom(tt).length" class="text-xs text-muted-foreground">{{ t('editor.terminals.linkedFrom') }}: <span class="font-mono">{{ linkedFrom(tt).join(', ') }}</span></p>
      <div class="grid grid-cols-2 gap-2">
        <FormRow :label="t('editor.terminals.conductor')">
          <Select :model-value="tt.conductor ?? '__'" @update:model-value="(v) => (tt.conductor = v === '__' ? undefined : (v as Terminal['conductor']))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">—</SelectItem>
              <SelectItem v-for="c in CONDUCTORS" :key="c" :value="c">{{ c }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.terminals.group')">
          <Input :model-value="tt.group ?? ''" placeholder="I / II" @update:model-value="(v) => (tt.group = String(v).trim() || undefined)" />
        </FormRow>
        <FormRow :label="t('editor.terminals.color')">
          <Input :model-value="tt.color ?? ''" @update:model-value="(v) => (tt.color = String(v).trim() || undefined)" />
        </FormRow>
        <FormRow :label="t('device.field.section')">
          <Select :model-value="tt.crossSection ? String(tt.crossSection) : '__'" @update:model-value="(v) => (tt.crossSection = v === '__' ? undefined : Number(v))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__">—</SelectItem>
              <SelectItem v-for="s in [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35]" :key="s" :value="String(s)">{{ s }} {{ t('units.mm2') }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
</style>
