export function formatKm(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  return (meters / 1000).toFixed(2)
}

export function formatMeters(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '—'
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} 公里`
  return `${meters.toFixed(meters < 10 ? 1 : 0)} 米`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${secs.toString().padStart(2, '0')} 秒`
  return `${minutes} 分 ${secs.toString().padStart(2, '0')} 秒`
}

export function formatClock(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatDateTime(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

export function buildConclusion(count: { total: number; severe: number; medium: number; minor: number }, distanceM: number, durationS: number): string {
  const km = Number.isFinite(distanceM) ? (distanceM / 1000).toFixed(2) : '—'
  const minutes = Number.isFinite(durationS) ? Math.max(1, Math.round(durationS / 60)) : 0
  return `本架次航程 ${km} 公里，飞行约 ${minutes} 分钟，标记缺陷 ${count.total} 处（严重 ${count.severe}、一般 ${count.medium}、轻微 ${count.minor}）。严重缺陷建议 48 小时内到场复核，必要时更换组件或停串；一般缺陷纳入本周消缺；轻微缺陷列入清洗和例行维护。定位来自照片 EXIF，偏离值为照片坐标到航迹的最近距离。`
}
