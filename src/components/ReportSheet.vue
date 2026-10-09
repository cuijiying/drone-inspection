<script setup lang="ts">
import { computed } from 'vue'
import { SEVERITY_COLOR } from '../catalog'
import { formatClock, formatCoord, formatDateTime, formatDuration, formatKm, formatMeters } from '../format'
import type { DefectPhoto, ReportMeta, Track } from '../types'

const props = defineProps<{
  meta: ReportMeta
  track: Track | null
  photos: DefectPhoto[]
  distanceM: number
  durationS: number
  altLabel: string
  mapShot: string
  sample: boolean
  conclusion: string
}>()

const emit = defineEmits<{
  close: []
  'update:conclusion': [value: string]
}>()

function printReport(): void {
  window.print()
}

function onConclusion(event: Event): void {
  emit('update:conclusion', (event.target as HTMLTextAreaElement).value)
}

const counts = computed(() => ({
  severe: props.photos.filter((photo) => photo.severity === '严重').length,
  medium: props.photos.filter((photo) => photo.severity === '一般').length,
  minor: props.photos.filter((photo) => photo.severity === '轻微').length,
}))
const printedAt = formatDateTime(new Date())
const start = computed(() => (props.track ? formatDateTime(props.track.points[0].time) : '—'))
const end = computed(() =>
  props.track ? formatClock(props.track.points[props.track.points.length - 1].time) : '—',
)
</script>

<template>
  <div class="report-layer">
    <div class="report-toolbar no-print">
      <strong>打印预览</strong>
      <span>一页纸，用浏览器打印即可存成 PDF</span>
      <div class="toolbar-actions">
        <button type="button" class="ghost" @click="emit('close')">返回三维</button>
        <button type="button" class="primary" @click="printReport">打印 / 导出 PDF</button>
      </div>
    </div>
    <article class="sheet">
      <header class="sheet-head">
        <div>
          <p class="kicker">光伏无人机巡检</p>
          <h1>一趟飞行，一份三维报告</h1>
        </div>
        <div class="sheet-id">
          <b>{{ meta.sortie || '未编号架次' }}</b>
          <span>生成于 {{ printedAt }}</span>
        </div>
      </header>

      <dl class="meta-grid">
        <div><dt>电站</dt><dd>{{ meta.site || '—' }}</dd></div>
        <div><dt>区域</dt><dd>{{ meta.zone || '—' }}</dd></div>
        <div><dt>班组</dt><dd>{{ meta.team || '—' }}</dd></div>
        <div><dt>飞行器</dt><dd>{{ meta.aircraft || '—' }}</dd></div>
        <div><dt>起飞</dt><dd>{{ start }}</dd></div>
        <div><dt>降落</dt><dd>同日 {{ end }}</dd></div>
      </dl>

      <div class="summary">
        <img v-if="mapShot" :src="mapShot" alt="航迹全览" />
        <div v-else class="map-fallback">三维全览未能写入报告，航迹数据仍在下表。</div>
        <ul>
          <li><span>航程</span><b>{{ track ? `${formatKm(distanceM)} 公里` : '—' }}</b></li>
          <li><span>时长</span><b>{{ track ? formatDuration(durationS) : '—' }}</b></li>
          <li><span>相对高度</span><b>{{ altLabel }}</b></li>
          <li><span>缺陷</span><b>{{ photos.length }} 处</b></li>
          <li><span>严重 / 一般 / 轻微</span><b>{{ counts.severe }} / {{ counts.medium }} / {{ counts.minor }}</b></li>
        </ul>
      </div>

      <h2>缺陷清单</h2>
      <table>
        <thead>
          <tr>
            <th>序号</th>
            <th>时间</th>
            <th>缺陷</th>
            <th>等级</th>
            <th>组件</th>
            <th>坐标</th>
            <th>偏离</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="photos.length === 0">
            <td colspan="8">本架次没有定位照片。</td>
          </tr>
          <tr v-for="(photo, index) in photos" :key="photo.id">
            <td>{{ index + 1 }}</td>
            <td>{{ formatClock(photo.time) }}</td>
            <td>{{ photo.defectType }}</td>
            <td><i :style="{ background: SEVERITY_COLOR[photo.severity] }" />{{ photo.severity }}</td>
            <td>{{ photo.moduleId || '—' }}</td>
            <td class="mono">{{ formatCoord(photo.lat, photo.lon) }}</td>
            <td>{{ formatMeters(photo.offsetM) }}</td>
            <td>{{ photo.note || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <h2>处置建议</h2>
      <textarea :value="conclusion" rows="3" @input="onConclusion" />

      <footer>
        <span v-if="sample">示例架次为合成航迹和合成照片，只用于演示，不代表现场真实缺陷。</span>
        <span v-else>坐标与时间来自航迹文件和照片 EXIF，照片时间按北京时间解读。</span>
        <span>三维回放使用公开卫星影像，高度为相对地面。</span>
      </footer>
    </article>
  </div>
</template>
