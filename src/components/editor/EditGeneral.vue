<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDraft } from '@/composables/useDraft'
import { useText } from '@/composables/useText'
import FormRow from './FormRow.vue'
import LocalizedInput from './LocalizedInput.vue'
import NumberInput from './NumberInput.vue'

const { d } = useDraft()
const { t, tx } = useText()
const ROLES = ['electrician', 'management', 'emergency', 'utility', 'other'] as const

function addContact() {
  d.value.meta.contacts.push({ role: 'electrician', name: '', phone: '' })
}
</script>

<template>
  <div class="space-y-8">
    <section data-tour="gen-meta" class="grid gap-4 md:grid-cols-2">
      <FormRow :label="t('editor.general.title')" class="md:col-span-2"><LocalizedInput v-model="d.meta.title" /></FormRow>
      <FormRow :label="t('editor.general.location')" :hint="t('editor.general.locationHint')"><LocalizedInput v-model="d.meta.location" /></FormRow>
      <FormRow :label="t('editor.general.enclosure')"><Input v-model="d.meta.enclosure" /></FormRow>
      <FormRow :label="t('editor.general.address')" :hint="t('editor.general.addressHint')"><Input v-model="d.meta.address" /></FormRow>
      <FormRow :label="t('editor.general.publicUrl')" :hint="t('editor.general.publicUrlHint')"><Input v-model="d.meta.publicUrl" placeholder="https://user.github.io/panel/app/" /></FormRow>
      <FormRow :label="t('editor.general.homeAssistantUrl')" :hint="t('editor.general.homeAssistantUrlHint')"><Input v-model="d.meta.homeAssistantUrl" placeholder="http://homeassistant.local:8123" /></FormRow>
    </section>

    <section data-tour="gen-supply">
      <h3 class="mb-3 font-semibold">{{ t('editor.general.supply') }}</h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FormRow :label="t('editor.general.phases')">
          <Select :model-value="String(d.supply.phases)" @update:model-value="(v) => (d.supply.phases = Number(v) as 1 | 3)">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 · 230 V</SelectItem>
              <SelectItem value="3">3 · 400 V</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.general.voltage')"><NumberInput v-model="d.supply.voltage" suffix="V" /></FormRow>
        <FormRow :label="t('editor.general.maxPower')"><NumberInput v-model="d.supply.maxPowerKw" optional :suffix="t('units.kw')" /></FormRow>
        <FormRow :label="t('editor.general.input')">
          <Select :model-value="d.supply.input ?? '__none'" @update:model-value="(v) => (d.supply.input = v === '__none' ? undefined : (v as string))">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              <SelectItem v-for="dev in d.devices.filter((x) => ['mcb', 'switch', 'rcd'].includes(x.type))" :key="dev.id" :value="dev.id">{{ dev.id }} · {{ tx(dev.label) }}</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow :label="t('editor.general.account')" :hint="t('editor.general.accountHint')">
          <Input :model-value="d.supply.account ?? ''" class="font-mono" @update:model-value="(v) => (d.supply.account = String(v) || undefined)" />
        </FormRow>
      </div>
    </section>

    <section data-tour="gen-contacts">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="font-semibold">{{ t('emergency.contacts') }}</h3>
        <Button size="sm" variant="outline" @click="addContact"><Plus /> {{ t('common.add') }}</Button>
      </div>
      <div class="space-y-3">
        <div v-for="(c, i) in d.meta.contacts" :key="i" class="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[10rem_1fr_12rem_auto]">
          <FormRow :label="t('editor.general.role')">
            <Select v-model="c.role">
              <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="r in ROLES" :key="r" :value="r">{{ t(`contact.role.${r}`) }}</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow :label="t('editor.general.name')"><Input v-model="c.name" /></FormRow>
          <FormRow :label="t('editor.general.phone')"><Input v-model="c.phone" type="tel" /></FormRow>
          <Button variant="ghost" size="icon" :aria-label="t('common.delete')" @click="d.meta.contacts.splice(i, 1)"><Trash2 /></Button>
          <FormRow :label="t('editor.general.contactNote')" class="sm:col-span-4"><LocalizedInput v-model="c.note" /></FormRow>
        </div>
      </div>
    </section>
  </div>
</template>
