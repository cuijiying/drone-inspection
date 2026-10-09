import exifr from 'exifr'
import { SEVERITY_LABEL, TYPE_LABEL } from './catalog'
import type { RawPhoto, Severity } from './types'

const BEIJING_OFFSET = '+08:00'

function parseExifClock(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null
  const match = raw.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!match) return null
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${BEIJING_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function decodeNote(encoded: string): string {
  try {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    if (text && !text.includes('\uFFFD')) return text
  } catch {
    /* 普通文本备注 */
  }
  return encoded
}

function parseDescription(raw: unknown): Pick<RawPhoto, 'defectType' | 'severity' | 'moduleId' | 'note'> {
  const fallback = { defectType: '待确认', severity: '未分级' as Severity, moduleId: '', note: '' }
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  const parts = raw.split('|')
  const defectType = TYPE_LABEL[parts[0]]
  const severity = SEVERITY_LABEL[parts[1]]
  if (defectType && severity && parts.length >= 3) {
    return {
      defectType,
      severity,
      moduleId: parts[2] ?? '',
      note: parts[3] ? decodeNote(parts.slice(3).join('|')) : '',
    }
  }
  return { ...fallback, note: raw.trim() }
}

export async function readPhoto(file: File): Promise<RawPhoto> {
  const parsed = (await exifr.parse(file, {
    reviveValues: false,
    gps: true,
    mergeOutput: true,
  })) as Record<string, unknown> | undefined

  const lat = typeof parsed?.latitude === 'number' ? parsed.latitude : null
  const lon = typeof parsed?.longitude === 'number' ? parsed.longitude : null
  const alt = typeof parsed?.GPSAltitude === 'number' ? parsed.GPSAltitude : null
  const time = parseExifClock(parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? parsed?.ModifyDate)
  const described = parseDescription(parsed?.ImageDescription ?? parsed?.UserComment)
  return {
    name: file.name,
    url: URL.createObjectURL(file),
    lat,
    lon,
    alt,
    time,
    ...described,
  }
}
