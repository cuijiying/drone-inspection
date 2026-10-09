import type { TrackPoint } from './types'

const EARTH_M = 6_371_000

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function trackLengthMeters(points: TrackPoint[]): number {
  let sum = 0
  for (let i = 1; i < points.length; i += 1) {
    sum += haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
  }
  return sum
}

export function trackDurationSeconds(points: TrackPoint[]): number {
  if (points.length < 2) return 0
  return (points[points.length - 1].time.getTime() - points[0].time.getTime()) / 1000
}

export function distanceToTrackMeters(points: TrackPoint[], lat: number, lon: number): number {
  if (points.length === 0) return Number.NaN
  if (points.length === 1) return haversineMeters(lat, lon, points[0].lat, points[0].lon)
  const lat0 = ((points[0].lat + lat) / 2) * (Math.PI / 180)
  const kx = 111_320 * Math.cos(lat0)
  const ky = 110_540
  const px = lon * kx
  const py = lat * ky
  let best = Infinity
  for (let i = 1; i < points.length; i += 1) {
    const ax = points[i - 1].lon * kx
    const ay = points[i - 1].lat * ky
    const bx = points[i].lon * kx
    const by = points[i].lat * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
  }
  return best
}

export function pointAtTime(points: TrackPoint[], time: Date): TrackPoint | null {
  if (points.length === 0) return null
  const target = time.getTime()
  if (target <= points[0].time.getTime()) return points[0]
  if (target >= points[points.length - 1].time.getTime()) return points[points.length - 1]
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].time.getTime() <= target) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  const span = b.time.getTime() - a.time.getTime()
  const t = span === 0 ? 0 : (target - a.time.getTime()) / span
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    alt: a.alt + (b.alt - a.alt) * t,
    time,
  }
}

export function altitudeRange(points: TrackPoint[]): { min: number; max: number } | null {
  if (points.length === 0) return null
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    min = Math.min(min, point.alt)
    max = Math.max(max, point.alt)
  }
  return { min, max }
}
