<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { CircleHelp, LockKeyhole, Monitor, Moon, RefreshCw, Sun, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useUi } from '@/stores/ui'
import { LOCALES } from '@/domain/model'
import { LOCALE_NAMES, setLocale } from '@/i18n'
import { applyUpdate, needRefresh, offlineReady } from '@/composables/usePwa'
import { useText } from '@/composables/useText'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { isDesktop } from '@/platform'
import { useData } from '@/stores/data'
import { useTour } from '@/tour/useTour'

const data = useData()
const router = useRouter()
const { t, locale } = useText()
const { mode } = useTheme()
const tour = useTour()
const ui = useUi()
function resetTours() {
  tour.reset()
  toast.success(t('tour.resetDone'))
}
const THEMES: { id: ThemeMode; icon: typeof Sun }[] = [
  { id: 'auto', icon: Monitor },
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
]

const version = __APP_VERSION__
const sourceLabel = computed(() => t(`settings.source.${data.source}`))

function lock() {
  data.lock()
  router.push('/')
}

async function clearCaches() {
  if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k)
  const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
  await Promise.all(regs.map((r) => r.unregister()))
  toast.success(t('settings.cacheCleared'))
  setTimeout(() => location.reload(), 600)
}

async function discard() {
  await data.discardDraft()
  toast.success(t('settings.draftDiscarded'))
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-5 lg:px-8 lg:pt-8">
    <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">{{ t('nav.settings') }}</h1>

    <section class="mt-6 space-y-6">
      <div>
        <h2 class="mb-2 text-sm font-semibold">{{ t('settings.language') }}</h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="l in LOCALES"
            :key="l"
            class="rounded-xl border px-3 py-2.5 text-sm transition"
            :class="locale === l ? 'border-primary bg-primary/10 font-medium' : 'bg-card hover:border-foreground/30'"
            @click="setLocale(l)"
          >
            {{ LOCALE_NAMES[l] }}
          </button>
        </div>
      </div>

      <div>
        <h2 class="mb-2 text-sm font-semibold">{{ t('settings.themeTitle') }}</h2>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="th in THEMES"
            :key="th.id"
            class="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition"
            :class="mode === th.id ? 'border-primary bg-primary/10 font-medium' : 'bg-card hover:border-foreground/30'"
            @click="mode = th.id"
          >
            <component :is="th.icon" class="size-4" /> {{ t(`settings.theme.${th.id}`) }}
          </button>
        </div>
      </div>

      <div>
        <h2 class="mb-2 text-sm font-semibold">{{ t('settings.panelTitle') }}</h2>
        <div class="divide-y rounded-2xl border bg-card">
          <label class="flex items-center justify-between gap-4 p-4">
            <div>
              <div class="text-sm font-medium">{{ t('settings.showScrews') }}</div>
              <div class="text-xs text-muted-foreground">{{ t('settings.showScrewsHint') }}</div>
            </div>
            <Switch v-model="ui.showScrews" />
          </label>
          <label class="flex items-center justify-between gap-4 p-4">
            <div>
              <div class="text-sm font-medium">{{ t('settings.showTerminalIds') }}</div>
              <div class="text-xs text-muted-foreground">{{ t('settings.showTerminalIdsHint') }}</div>
            </div>
            <Switch v-model="ui.showTerminalIds" />
          </label>
        </div>
      </div>

      <div class="divide-y rounded-2xl border bg-card">
        <div class="flex items-center justify-between gap-4 p-4">
          <div>
            <div class="text-sm font-medium">{{ t('settings.lock') }}</div>
            <div class="text-xs text-muted-foreground">{{ t('settings.lockHint') }}</div>
          </div>
          <Button variant="outline" size="sm" @click="lock"><LockKeyhole /> {{ t('settings.lockAction') }}</Button>
        </div>
        <div v-if="data.hasDraft" class="flex items-center justify-between gap-4 p-4">
          <div>
            <div class="text-sm font-medium">{{ t('settings.draft') }}</div>
            <div class="text-xs text-muted-foreground">{{ t('settings.draftHint') }}</div>
          </div>
          <Button variant="destructive" size="sm" @click="discard"><Trash2 /> {{ t('settings.discard') }}</Button>
        </div>
        <div class="flex items-center justify-between gap-4 p-4">
          <div>
            <div class="text-sm font-medium">{{ t('tour.resetTitle') }}</div>
            <div class="text-xs text-muted-foreground">{{ t('tour.resetHint') }}</div>
          </div>
          <Button variant="outline" size="sm" @click="resetTours"><CircleHelp /> {{ t('tour.reset') }}</Button>
        </div>
        <div v-if="!isDesktop" class="flex items-center justify-between gap-4 p-4">
          <div>
            <div class="text-sm font-medium">{{ t('settings.offline') }}</div>
            <div class="text-xs text-muted-foreground">{{ offlineReady ? t('pwa.readyHint') : t('settings.offlineNotYet') }}</div>
          </div>
          <Button v-if="needRefresh" size="sm" @click="applyUpdate()"><RefreshCw /> {{ t('pwa.update') }}</Button>
          <Button v-else variant="outline" size="sm" @click="clearCaches"><RefreshCw /> {{ t('settings.clearCache') }}</Button>
        </div>
      </div>

      <dl class="divide-y rounded-2xl border bg-card text-sm">
        <div class="flex justify-between p-3.5"><dt class="text-muted-foreground">{{ t('settings.version') }}</dt><dd class="font-mono">{{ version }}{{ isDesktop ? ' · desktop' : '' }}</dd></div>
        <div class="flex justify-between p-3.5"><dt class="text-muted-foreground">{{ t('settings.dataSource') }}</dt><dd>{{ sourceLabel }}<template v-if="data.file"> · {{ data.file.name }}</template></dd></div>
        <div v-if="data.data?.meta.updated" class="flex justify-between p-3.5"><dt class="text-muted-foreground">{{ t('settings.updated') }}</dt><dd>{{ data.data.meta.updated }}</dd></div>
        <div class="flex justify-between p-3.5"><dt class="text-muted-foreground">{{ t('settings.encryption') }}</dt><dd>AES-256-GCM · PBKDF2 310k</dd></div>
      </dl>
    </section>
  </div>
</template>
