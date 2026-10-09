import type { Severity } from './types'

export const TYPE_LABEL: Record<string, string> = {
  hotspot: '热斑',
  crack: '隐裂',
  glass: '玻璃破损',
  soiling: '组件污秽',
  diode: '二极管故障',
  bird: '鸟粪遮挡',
  snail: '蜗牛纹',
  frame: '边框变形',
  junction: '接线盒烧蚀',
  weed: '杂草遮挡',
  dust: '灰尘堆积',
  missing: '组件缺失',
  ribbon: '焊带变色',
  rust: '支架锈蚀',
  pid: 'PID疑似',
  tilt: '组件倾角异常',
}

export const SEVERITY_LABEL: Record<string, Severity> = {
  severe: '严重',
  medium: '一般',
  minor: '轻微',
}

export const DEFECT_SUGGESTIONS = [
  '热斑',
  '隐裂',
  '玻璃破损',
  '组件污秽',
  '二极管故障',
  '鸟粪遮挡',
  '蜗牛纹',
  '边框变形',
  '接线盒烧蚀',
  '杂草遮挡',
  '灰尘堆积',
  '组件缺失',
  '焊带变色',
  '支架锈蚀',
  'PID疑似',
  '组件倾角异常',
  '待确认',
]

export const SEVERITY_COLOR: Record<Severity, string> = {
  严重: '#e85d4c',
  一般: '#e6a23c',
  轻微: '#3dbe7a',
  未分级: '#8ea097',
}
