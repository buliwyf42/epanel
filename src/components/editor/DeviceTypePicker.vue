<script setup lang="ts">
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TYPE_ACCENT } from '@/components/panel/geometry'
import type { DeviceType } from '@/domain/model'
import { newDeviceWidth as width } from '@/editor/ops'
import { useText } from '@/composables/useText'

const open = defineModel<boolean>('open', { required: true })
defineProps<{ row: number; free: number }>()
const emit = defineEmits<{ pick: [type: DeviceType] }>()
const { t } = useText()

const GROUPS: { id: string; types: DeviceType[] }[] = [
  { id: 'protection', types: ['mcb', 'rcd', 'rcbo', 'afdd', 'fuse', 'voltage-relay', 'spd'] },
  { id: 'control', types: ['meter', 'switch', 'contactor', 'impulse-relay', 'time-relay', 'dimmer', 'din-socket'] },
  { id: 'power', types: ['psu', 'ats', 'ups'] },
  { id: 'wiring', types: ['bus', 'terminal', 'distribution-block'] },
  { id: 'smart', types: ['actuator', 'bus-psu', 'bus-gateway', 'bus-io'] },
  { id: 'other', types: ['other'] },
]

function pick(type: DeviceType) {
  emit('pick', type)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t('editor.panel.slotTitle') }}</DialogTitle>
        <DialogDescription>{{ t('editor.panel.slotWhere', { row: row + 1, free }) }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-5">
        <section v-for="g in GROUPS" :key="g.id">
          <h3 class="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{{ t(`editor.panel.group.${g.id}`) }}</h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="tp in g.types"
              :key="tp"
              class="flex items-start gap-3 rounded-xl border p-3 text-left transition hover:border-primary/60 hover:bg-accent"
              @click="pick(tp)"
            >
              <span class="mt-1.5 size-2.5 shrink-0 rounded-full" :style="{ background: TYPE_ACCENT[tp] }" />
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2">
                  <span class="font-medium">{{ t(`device.type.${tp}`) }}</span>
                  <span class="shrink-0 font-mono text-xs" :class="width(tp) > free ? 'text-warn' : 'text-muted-foreground'">{{ width(tp) }} {{ t('editor.panel.mod') }}</span>
                </span>
                <span class="mt-0.5 block text-sm text-muted-foreground">{{ t(`device.typeHint.${tp}`) }}</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
