export type Severity = '严重' | '一般' | '轻微' | '未分级'

export interface TrackPoint {
  lat: number
  lon: number
  alt: number
  time: Date
}

export interface Track {
  name: string
  description: string
  filename: string
  points: TrackPoint[]
}

export interface DefectPhoto {
  id: string
  name: string
  url: string
  lat: number
  lon: number
  alt: number | null
  time: Date | null
  defectType: string
  severity: Severity
  moduleId: string
  note: string
  offsetM: number | null
  positionedBy: 'gps' | 'time'
}

export interface ReportMeta {
  site: string
  sortie: string
  team: string
  aircraft: string
  zone: string
}

export interface RawPhoto {
  name: string
  url: string
  lat: number | null
  lon: number | null
  alt: number | null
  time: Date | null
  defectType: string
  severity: Severity
  moduleId: string
  note: string
}
