<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import PlaybackBar from './components/PlaybackBar.vue'
import ReportSheet from './components/ReportSheet.vue'
import Sidebar from './components/Sidebar.vue'
import { refreshOffsets, placePhotos } from './flight'
import { altitudeRange } from './geo'
import { buildConclusion, formatClock } from './format'
import { parseTrackXml, trackStats } from './parseTrack'
import { readPhoto } from './parsePhoto'
import { loadSample } from './sample'
import { FlightScene, type Basemap } from './scene'
import type { DefectPhoto, ReportMeta, Track } from './types'

const cesiumEl = ref<HTMLElement | null>(null)
const trackInput = ref<HTMLInputElement | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const track = ref<Track | null>(null)
const photos = ref<DefectPhoto[]>([])
const selectedId = ref<string | null>(null)
const playing = ref(false)
const follow = ref(true)
const speed = ref(16)
const progress = ref(0)
const currentTime = ref<Date | null>(null)
const basemap = ref<Basemap>('satellite')
const loading = ref(true)
const status = ref('正在准备三维场景')
const toast = ref('')
const dragging = ref(false)
const reportOpen = ref(false)
const mapShot = ref('')
const sample = ref(false)
const conclusion = ref('')
const conclusionEdited = ref(false)
const meta = reactive<ReportMeta>({
  site: '',
  sortie: '',
  team: '巡检一班',
  aircraft: '',
  zone: '',
})

let scene: FlightScene | null = null
let toastTimer = 0

const stats = computed(() => trackStats(track.value))
const altLabel = computed(() => {
  const range = track.value ? altitudeRange(track.value.points) : null
  if (!range) return '—'
  return `${range.min.toFixed(0)}–${range.max.toFixed(0)} 米`
})
const clockLabel = computed(() => {
  if (!track.value || !currentTime.value) return '00:00:00 / 00:00:00'
  const end = track.value.points[track.value.points.length - 1].time
  return `${formatClock(currentTime.value)} / ${formatClock(end)}`
})
const subtitle = computed(() => {
  if (meta.site && meta.sortie) return `${meta.site} · ${meta.sortie}`
  return '上传航迹和照片，或直接查看示例架次'
})

function notify(message: string): void {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 4200)
}

function revokePhotos(list: DefectPhoto[]): void {
  for (const photo of list) URL.revokeObjectURL(photo.url)
}

function applyBundle(nextTrack: Track, nextPhotos: DefectPhoto[], fromSample: boolean): void {
  revokePhotos(photos.value)
  track.value = nextTrack
  photos.value = nextPhotos
  selectedId.value = nextPhotos[0]?.id ?? null
  sample.value = fromSample
  progress.value = 0
  playing.value = false
  currentTime.value = nextTrack.points[0]?.time ?? null
  conclusionEdited.value = false
  conclusion.value = buildConclusion(severityCount(nextPhotos), trackStats(nextTrack).distanceM, trackStats(nextTrack).durationS)
  scene?.setTrack(nextTrack)
  scene?.setPhotos(nextPhotos, selectedId.value)
  scene?.setSpeed(speed.value)
  scene?.setFollow(follow.value, false)
}

function severityCount(list: DefectPhoto[]) {
  return {
    total: list.length,
    severe: list.filter((photo) => photo.severity === '严重').length,
    medium: list.filter((photo) => photo.severity === '一般').length,
    minor: list.filter((photo) => photo.severity === '轻微').length,
  }
}

async function openSample(): Promise<void> {
  loading.value = true
  status.value = '正在加载示例架次'
  try {
    const bundle = await loadSample((text) => {
      status.value = text
    })
    meta.site = bundle.meta.site
    meta.sortie = bundle.meta.sortie
    meta.team = bundle.meta.team
    meta.aircraft = bundle.meta.aircraft
    meta.zone = bundle.meta.zone
    applyBundle(bundle.track, bundle.photos, true)
    notify(`已载入示例架次，${bundle.photos.length} 处缺陷`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '示例架次加载失败')
  } finally {
    loading.value = false
  }
}

async function onTrackFile(file: File): Promise<void> {
  const text = await file.text()
  const next = parseTrackXml(text, file.name)
  refreshOffsets(photos.value, next)
  track.value = next
  sample.value = false
  if (!meta.site) meta.site = next.name
  scene?.setTrack(next)
  scene?.setPhotos(photos.value, selectedId.value)
  playing.value = false
  conclusionEdited.value = false
  conclusion.value = buildConclusion(severityCount(photos.value), trackStats(next).distanceM, trackStats(next).durationS)
  notify(`已载入航迹 ${file.name}`)
}

async function onPhotoFiles(files: File[]): Promise<void> {
  const raws = []
  for (const file of files) raws.push(await readPhoto(file))
  const placed = placePhotos(raws, track.value)
  for (const raw of raws) {
    if (!placed.photos.some((photo) => photo.url === raw.url)) URL.revokeObjectURL(raw.url)
  }
  photos.value = [...photos.value, ...placed.photos].sort((a, b) => {
    return (a.time?.getTime() ?? Number.POSITIVE_INFINITY) - (b.time?.getTime() ?? Number.POSITIVE_INFINITY)
  })
  sample.value = false
  scene?.setPhotos(photos.value, selectedId.value)
  conclusionEdited.value = false
  conclusion.value = buildConclusion(severityCount(photos.value), stats.value.distanceM, stats.value.durationS)
  if (placed.skipped.length) {
    notify(`已加入 ${placed.photos.length} 张，${placed.skipped.length} 张缺少坐标和时间已跳过`)
  } else {
    notify(`已加入 ${placed.photos.length} 张照片`)
  }
}

async function ingestFiles(files: File[]): Promise<void> {
  const tracks = files.filter((file) => /\.(gpx|kml|xml)$/i.test(file.name))
  const images = files.filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|tiff?)$/i.test(file.name))
  try {
    if (tracks[0]) await onTrackFile(tracks[0])
    if (images.length) await onPhotoFiles(images)
    if (!tracks.length && !images.length) notify('请拖入 GPX、KML 或照片')
  } catch (error) {
    notify(error instanceof Error ? error.message : '文件读取失败')
  }
}

function selectPhoto(id: string): void {
  selectedId.value = id
  const photo = photos.value.find((item) => item.id === id)
  if (!photo) return
  playing.value = false
  scene?.pause()
  scene?.setPhotos(photos.value, id)
  scene?.flyToPhoto(photo)
}

function togglePlay(): void {
  if (!track.value) return
  if (playing.value) {
    scene?.pause()
    playing.value = false
  } else {
    scene?.play()
    playing.value = true
  }
}

function openReport(): void {
  scene?.pause()
  playing.value = false
  if (!conclusionEdited.value) {
    conclusion.value = buildConclusion(severityCount(photos.value), stats.value.distanceM, stats.value.durationS)
  }
  mapShot.value = scene?.captureOverview() ?? ''
  reportOpen.value = true
}

function onConclusion(value: string): void {
  conclusionEdited.value = true
  conclusion.value = value
}

function onTrackPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void ingestFiles([file])
}

function onPhotosPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) void ingestFiles(files)
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  void ingestFiles([...(event.dataTransfer?.files ?? [])])
}

function clearPhotos(): void {
  revokePhotos(photos.value)
  photos.value = []
  selectedId.value = null
  scene?.setPhotos([], null)
  conclusionEdited.value = false
  conclusion.value = buildConclusion(severityCount([]), stats.value.distanceM, stats.value.durationS)
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
  if (event.code === 'Space') {
    event.preventDefault()
    togglePlay()
  }
}

watch(basemap, (value) => scene?.setBasemap(value))
watch(
  photos,
  () => {
    if (!reportOpen.value) scene?.setPhotos(photos.value, selectedId.value)
  },
  { deep: true },
)

onMounted(async () => {
  if (!cesiumEl.value) return
  try {
    scene = new FlightScene(cesiumEl.value, {
      onTick: (state) => {
        progress.value = state.progress
        currentTime.value = state.time
        if (!state.playing && playing.value) playing.value = false
      },
      onSelect: (id) => selectPhoto(id),
      onFollowChange: (value) => {
        follow.value = value
      },
    })
    scene.setSpeed(speed.value)
    scene.setFollow(follow.value)
  } catch (error) {
    loading.value = false
    notify(error instanceof Error ? error.message : '三维场景创建失败，请使用支持 WebGL 的浏览器')
    return
  }
  window.addEventListener('keydown', onKey)
  await openSample()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  scene?.destroy()
  revokePhotos(photos.value)
})
</script>

<template>
  <div
    class="app"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="mark">巡</span>
          <div>
            <h1>一趟飞行，一份三维报告</h1>
            <p>{{ subtitle }}</p>
          </div>
        </div>
        <div class="actions">
          <button type="button" @click="openSample">示例架次</button>
          <button type="button" @click="trackInput?.click()">上传航线</button>
          <button type="button" @click="photoInput?.click()">上传照片</button>
          <button type="button" class="primary" @click="openReport">生成报告</button>
        </div>
        <input ref="trackInput" class="hidden" type="file" accept=".gpx,.kml,.xml" @change="onTrackPicked" />
        <input ref="photoInput" class="hidden" type="file" accept="image/*" multiple @change="onPhotosPicked" />
      </header>

      <div class="workspace">
        <div class="map-wrap">
          <div ref="cesiumEl" class="cesium-root" />
          <div class="map-tools">
            <div class="legend">
              <span><i style="background:#e85d4c" />严重</span>
              <span><i style="background:#e6a23c" />一般</span>
              <span><i style="background:#3dbe7a" />轻微</span>
              <span><i class="line" />航迹</span>
            </div>
            <div class="basemap">
              <button type="button" :class="{ on: basemap === 'satellite' }" @click="basemap = 'satellite'">卫星</button>
              <button type="button" :class="{ on: basemap === 'streets' }" @click="basemap = 'streets'">街道</button>
            </div>
          </div>
          <PlaybackBar
            :playing="playing"
            :progress="progress"
            :follow="follow"
            :speed="speed"
            :clock-label="clockLabel"
            :disabled="!track"
            @toggle="togglePlay"
            @seek="(value) => { progress = value; scene?.seek(value) }"
            @update:follow="(value) => { follow = value; scene?.setFollow(value) }"
            @update:speed="(value) => { speed = value; scene?.setSpeed(value) }"
            @frame="() => { follow = false; scene?.setFollow(false); scene?.frameAll() }"
          />
          <div v-if="loading" class="loading">{{ status }}</div>
          <div v-if="dragging" class="dropmask">松开以导入航迹或照片</div>
        </div>
        <Sidebar
          :track="track"
          :photos="photos"
          :selected-id="selectedId"
          :distance-m="stats.distanceM"
          :duration-s="stats.durationS"
          :alt-label="altLabel"
          :meta="meta"
          :sample="sample"
          @select="selectPhoto"
          @clear-photos="clearPhotos"
        />
      </div>
    </div>

    <ReportSheet
      v-if="reportOpen"
      :meta="meta"
      :track="track"
      :photos="photos"
      :distance-m="stats.distanceM"
      :duration-s="stats.durationS"
      :alt-label="altLabel"
      :map-shot="mapShot"
      :sample="sample"
      :conclusion="conclusion"
      @update:conclusion="onConclusion"
      @close="reportOpen = false"
    />
    <p v-if="toast" class="toast">{{ toast }}</p>
  </div>
</template>
