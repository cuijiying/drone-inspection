import { distanceToTrackMeters, pointAtTime } from './geo'
import type { DefectPhoto, RawPhoto, Track } from './types'

export function placePhotos(raws: RawPhoto[], track: Track | null): { photos: DefectPhoto[]; skipped: string[] } {
  const photos: DefectPhoto[] = []
  const skipped: string[] = []
  const used = new Set<string>()

  raws.forEach((raw, index) => {
    let lat = raw.lat
    let lon = raw.lon
    let positionedBy: DefectPhoto['positionedBy'] = 'gps'
    if (lat == null || lon == null) {
      if (raw.time && track) {
        const onTrack = pointAtTime(track.points, raw.time)
        if (!onTrack) {
          skipped.push(raw.name)
          return
        }
        lat = onTrack.lat
        lon = onTrack.lon
        positionedBy = 'time'
      } else {
        skipped.push(raw.name)
        return
      }
    }
    const base = raw.name.replace(/\.[^.]+$/, '') || `照片${index + 1}`
    let id = base
    let n = 2
    while (used.has(id)) {
      id = `${base}-${n}`
      n += 1
    }
    used.add(id)
    photos.push({
      id,
      name: raw.name,
      url: raw.url,
      lat,
      lon,
      alt: raw.alt,
      time: raw.time,
      defectType: raw.defectType,
      severity: raw.severity,
      moduleId: raw.moduleId,
      note: raw.note,
      offsetM: track ? distanceToTrackMeters(track.points, lat, lon) : null,
      positionedBy,
    })
  })

  photos.sort((a, b) => {
    const at = a.time?.getTime() ?? Number.POSITIVE_INFINITY
    const bt = b.time?.getTime() ?? Number.POSITIVE_INFINITY
    return at - bt
  })
  return { photos, skipped }
}

export function refreshOffsets(photos: DefectPhoto[], track: Track | null): void {
  for (const photo of photos) {
    photo.offsetM = track ? distanceToTrackMeters(track.points, photo.lat, photo.lon) : null
  }
}
