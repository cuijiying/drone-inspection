<script setup lang="ts">
defineProps<{
  playing: boolean
  progress: number
  follow: boolean
  speed: number
  clockLabel: string
  disabled: boolean
}>()

const emit = defineEmits<{
  toggle: []
  seek: [progress: number]
  'update:follow': [value: boolean]
  'update:speed': [value: number]
  frame: []
}>()

const speeds = [1, 4, 8, 16, 32]

function onSeek(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  emit('seek', value / 1000)
}

function onFollow(event: Event): void {
  emit('update:follow', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="playback">
    <button class="play" type="button" :disabled="disabled" @click="emit('toggle')">
      {{ playing ? '暂停' : '播放' }}
    </button>
    <div class="scrub">
      <input
        type="range"
        min="0"
        max="1000"
        :value="Math.round(progress * 1000)"
        :disabled="disabled"
        aria-label="回放进度"
        @input="onSeek"
      />
      <span class="clock">{{ clockLabel }}</span>
    </div>
    <div class="speeds" role="group" aria-label="回放速度">
      <button
        v-for="item in speeds"
        :key="item"
        type="button"
        :class="{ on: speed === item }"
        @click="emit('update:speed', item)"
      >
        {{ item }}×
      </button>
    </div>
    <label class="follow">
      <input
        type="checkbox"
        :checked="follow"
        @change="onFollow"
      />
      镜头跟随
    </label>
    <button type="button" class="ghost" :disabled="disabled" @click="emit('frame')">全览</button>
  </div>
</template>
