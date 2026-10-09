import { placePhotos } from './flight'
import { parseTrackXml } from './parseTrack'
import { readPhoto } from './parsePhoto'
import type { DefectPhoto, ReportMeta, Track } from './types'

interface SampleManifest {
  track: string
  kml?: string
  site: string
  sortie: string
  zone: string
  photos: string[]
}

export interface SampleBundle {
  track: Track
  photos: DefectPhoto[]
  meta: ReportMeta
}

export async function loadSample(onProgress?: (text: string) => void): Promise<SampleBundle> {
  onProgress?.('正在读取示例航迹')
  const manifest = (await fetch('/sample/manifest.json').then((response) => {
    if (!response.ok) throw new Error('找不到示例航迹')
    return response.json()
  })) as SampleManifest
  const gpx = await fetch(`/sample/${manifest.track}`).then((response) => {
    if (!response.ok) throw new Error('示例航迹读取失败')
    return response.text()
  })
  const track = parseTrackXml(gpx, manifest.track)
  const raws = []
  for (let index = 0; index < manifest.photos.length; index += 1) {
    const relative = manifest.photos[index]
    onProgress?.(`正在读取示例照片 ${index + 1}/${manifest.photos.length}`)
    const response = await fetch(`/sample/${relative}`)
    if (!response.ok) throw new Error(`示例照片读取失败：${relative}`)
    const blob = await response.blob()
    const name = relative.split('/').pop() ?? `photo-${index + 1}.jpg`
    raws.push(await readPhoto(new File([blob], name, { type: blob.type || 'image/jpeg' })))
  }
  const { photos, skipped } = placePhotos(raws, track)
  if (skipped.length > 0) {
    throw new Error(`示例照片缺少定位：${skipped.join('、')}`)
  }
  return {
    track,
    photos,
    meta: {
      site: manifest.site,
      sortie: manifest.sortie,
      team: '巡检一班',
      aircraft: '经纬 M30T',
      zone: manifest.zone,
    },
  }
}
