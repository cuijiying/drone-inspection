<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEFECT_SUGGESTIONS, SEVERITY_COLOR } from '../catalog'
import { formatClock, formatCoord, formatDuration, formatKm, formatMeters } from '../format'
import type { DefectPhoto, ReportMeta, Track } from '../types'

const props = defineProps<{
  track: Track | null
  photos: DefectPhoto[]
  selectedId: string | null
  distanceM: number
  durationS: number
  altLabel: string
  meta: ReportMeta
  sample: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  'clear-photos': []
}>()

type Filter = '全部' | '严重' | '一般' | '轻微'
const filter = ref<Filter>('全部')
const filters: Filter[] = ['全部', '严重', '一般', '轻微']

const visible = computed(() =>
  props.photos.filter((photo) => filter.value === '全部' || photo.severity === filter.value),
)
const selected = computed(() => props.photos.find((photo) => photo.id === props.selectedId) ?? null)
const counts = computed(() => ({
  严重: props.photos.filter((photo) => photo.severity === '严重').length,
  一般: props.photos.filter((photo) => photo.severity === '一般').length,
  轻微: props.photos.filter((photo) => photo.severity === '轻微').length,
}))

function chipCount(item: Filter): number {
  if (item === '全部') return props.photos.length
  return counts.value[item]
}
</script>

<template>
  <aside class="sidebar">
    <section>
      <div class="section-title">
        <h2>架次概况</h2>
        <span v-if="sample" class="pill">示例</span>
      </div>
      <p class="track-name">{{ track?.name || '尚未加载航迹' }}</p>
      <dl class="stats">
        <div>
          <dt>航程</dt>
          <dd>{{ track ? `${formatKm(distanceM)} 公里` : '—' }}</dd>
        </div>
        <div>
          <dt>时长</dt>
          <dd>{{ track ? formatDuration(durationS) : '—' }}</dd>
        </div>
        <div>
          <dt>相对高度</dt>
          <dd>{{ altLabel }}</dd>
        </div>
        <div>
          <dt>缺陷</dt>
          <dd>{{ photos.length }} 处</dd>
        </div>
      </dl>
      <p v-if="track?.description" class="desc">{{ track.description }}</p>
    </section>

    <section>
      <h2>报告信息</h2>
      <label>电站<input v-model="meta.site" /></label>
      <label>架次<input v-model="meta.sortie" /></label>
      <label>区域<input v-model="meta.zone" /></label>
      <label>班组<input v-model="meta.team" /></label>
      <label>飞行器<input v-model="meta.aircraft" /></label>
    </section>

    <section class="list-section">
      <div class="section-title">
        <h2>缺陷清单</h2>
        <button v-if="photos.length" type="button" class="text-btn" @click="emit('clear-photos')">清空照片</button>
      </div>
      <div class="filters">
        <button
          v-for="item in filters"
          :key="item"
          type="button"
          :class="{ on: filter === item }"
          @click="filter = item"
        >
          {{ item }}
          <em v-if="item !== '全部'">{{ chipCount(item) }}</em>
        </button>
      </div>
      <p v-if="photos.length === 0" class="empty">上传带 GPS 和拍摄时间的照片后，会按坐标钉在航迹旁。</p>
      <ul v-else class="defects">
        <li v-for="photo in visible" :key="photo.id">
          <button type="button" :class="{ on: photo.id === selectedId }" @click="emit('select', photo.id)">
            <span class="idx" :style="{ background: SEVERITY_COLOR[photo.severity] }">{{ photos.indexOf(photo) + 1 }}</span>
            <span class="body">
              <strong>{{ photo.defectType }}</strong>
              <small>{{ photo.severity }} · {{ photo.moduleId || '未编号' }} · {{ formatClock(photo.time) }}</small>
            </span>
            <span class="off">{{ formatMeters(photo.offsetM) }}</span>
          </button>
        </li>
      </ul>
      <p v-if="photos.length && visible.length === 0" class="empty">这一级没有缺陷。</p>
    </section>

    <section v-if="selected" class="detail">
      <h2>缺陷详情</h2>
      <img :src="selected.url" :alt="selected.defectType" />
      <p class="coord">
        {{ formatCoord(selected.lat, selected.lon) }}
        · {{ selected.positionedBy === 'gps' ? 'EXIF 坐标' : '按时间对齐航迹' }}
        · 偏离 {{ formatMeters(selected.offsetM) }}
      </p>
      <label>
        缺陷类型
        <input v-model="selected.defectType" list="defect-types" />
        <datalist id="defect-types">
          <option v-for="item in DEFECT_SUGGESTIONS" :key="item" :value="item" />
        </datalist>
      </label>
      <label>
        等级
        <select v-model="selected.severity">
          <option>严重</option>
          <option>一般</option>
          <option>轻微</option>
          <option>未分级</option>
        </select>
      </label>
      <label>组件编号<input v-model="selected.moduleId" /></label>
      <label>备注<textarea v-model="selected.note" rows="3" /></label>
    </section>
  </aside>
</template>
