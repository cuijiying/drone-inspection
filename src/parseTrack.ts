import { trackDurationSeconds, trackLengthMeters } from './geo'
import type { Track, TrackPoint } from './types'

function elementsByLocalName(root: ParentNode, name: string): Element[] {
  const found: Element[] = []
  const walk = (node: Element) => {
    if (node.localName === name) found.push(node)
    for (const child of node.children) walk(child)
  }
  if (root instanceof Element) walk(root)
  else {
    for (const child of root.children) {
      if (child instanceof Element) walk(child)
    }
  }
  return found
}

function childText(parent: Element, name: string): string {
  for (const child of parent.children) {
    if (child.localName === name) return child.textContent?.trim() ?? ''
  }
  return ''
}

function parseTime(raw: string | null): Date | null {
  if (!raw) return null
  const date = new Date(raw.trim())
  return Number.isNaN(date.getTime()) ? null : date
}

function assignTimes(points: TrackPoint[]): TrackPoint[] {
  if (points.length === 0) return points
  const known = points.filter((point) => !Number.isNaN(point.time.getTime()))
  if (known.length === points.length) return points
  if (known.length === 0) {
    const start = Date.now()
    let travelled = 0
    const speed = 5
    return points.map((point, index) => {
      if (index > 0) {
        travelled += distance(points[index - 1], point)
      }
      return { ...point, time: new Date(start + (travelled / speed) * 1000) }
    })
  }
  return points.map((point, index) => {
    if (!Number.isNaN(point.time.getTime())) return point
    const prev = [...points.slice(0, index)].reverse().find((item) => !Number.isNaN(item.time.getTime()))
    const next = points.slice(index + 1).find((item) => !Number.isNaN(item.time.getTime()))
    if (prev && next) {
      const span = next.time.getTime() - prev.time.getTime()
      const prevIndex = points.indexOf(prev)
      const nextIndex = points.indexOf(next)
      const t = nextIndex === prevIndex ? 0 : (index - prevIndex) / (nextIndex - prevIndex)
      return { ...point, time: new Date(prev.time.getTime() + span * t) }
    }
    const anchor = prev ?? next
    if (!anchor) return point
    return { ...point, time: new Date(anchor.time.getTime()) }
  })
}

function distance(a: TrackPoint, b: TrackPoint): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function parseGpx(doc: Document, filename: string): TrackPoint[] {
  const nodes = elementsByLocalName(doc, 'trkpt')
  const source = nodes.length > 0 ? nodes : elementsByLocalName(doc, 'rtept')
  return source.map((node) => ({
    lat: Number(node.getAttribute('lat')),
    lon: Number(node.getAttribute('lon')),
    alt: Number(childText(node, 'ele') || '100'),
    time: parseTime(childText(node, 'time')) ?? new Date(Number.NaN),
  }))
}

function parseKml(doc: Document, filename: string): TrackPoint[] {
  const whens = elementsByLocalName(doc, 'when').map((node) => parseTime(node.textContent))
  const coords = elementsByLocalName(doc, 'coord')
  if (coords.length > 0) {
    return coords.map((node, index) => {
      const [lon, lat, alt] = (node.textContent ?? '').trim().split(/\s+/).map(Number)
      return {
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : 100,
        time: whens[index] ?? new Date(Number.NaN),
      }
    })
  }
  const lines = elementsByLocalName(doc, 'coordinates')
  const points: TrackPoint[] = []
  for (const line of lines) {
    const tuples = (line.textContent ?? '').trim().split(/\s+/)
    for (const tuple of tuples) {
      if (!tuple) continue
      const [lon, lat, alt] = tuple.split(',').map(Number)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      points.push({
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : 100,
        time: new Date(Number.NaN),
      })
    }
  }
  return points
}

function documentName(doc: Document, filename: string): { name: string; description: string } {
  const names = elementsByLocalName(doc, 'name')
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
  const descriptions = elementsByLocalName(doc, 'description')
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
  const desc = elementsByLocalName(doc, 'desc')
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
  return {
    name: names[0] || filename.replace(/\.(gpx|kml|xml)$/i, ''),
    description: descriptions[0] || desc[0] || '',
  }
}

export function parseTrackXml(xml: string, filename: string): Track {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('航迹文件无法解析，请确认是 GPX 或 KML')
  }
  const root = doc.documentElement?.localName?.toLowerCase() ?? ''
  let points: TrackPoint[]
  if (root === 'gpx') points = parseGpx(doc, filename)
  else if (root === 'kml') points = parseKml(doc, filename)
  else if (xml.includes('<gpx')) points = parseGpx(doc, filename)
  else if (xml.includes('<kml')) points = parseKml(doc, filename)
  else throw new Error('请上传 GPX 或 KML 航迹')

  points = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
  if (points.length < 2) throw new Error('航迹至少需要两个坐标点')
  points = assignTimes(points)
  const meta = documentName(doc, filename)
  return {
    name: meta.name,
    description: meta.description,
    filename,
    points,
  }
}

export function trackStats(track: Track | null): { distanceM: number; durationS: number } {
  if (!track) return { distanceM: 0, durationS: 0 }
  return {
    distanceM: trackLengthMeters(track.points),
    durationS: trackDurationSeconds(track.points),
  }
}
