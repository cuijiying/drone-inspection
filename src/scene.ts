import * as Cesium from 'cesium'
import { SEVERITY_COLOR } from './catalog'
import type { DefectPhoto, Track } from './types'

export type Basemap = 'satellite' | 'streets'

export interface SceneHandlers {
  onTick: (state: { progress: number; time: Date | null; playing: boolean }) => void
  onSelect: (id: string) => void
  onFollowChange: (follow: boolean) => void
}

const SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const STREETS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'

function imagery(url: string, credit: string): Cesium.UrlTemplateImageryProvider {
  // 该区域 19 级及以上是 Esri 的 “Map data not yet available” 占位图。
  // 封顶后 Cesium 会放大最后一级真实影像，近距离跟随仍能看到地面。
  return new Cesium.UrlTemplateImageryProvider({
    url,
    maximumLevel: 18,
    credit,
  })
}

function droneIcon(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.translate(32, 32)
  ctx.fillStyle = '#1b1408'
  ctx.beginPath()
  ctx.arc(-16, -16, 8, 0, Math.PI * 2)
  ctx.arc(16, -16, 8, 0, Math.PI * 2)
  ctx.arc(-16, 16, 8, 0, Math.PI * 2)
  ctx.arc(16, 16, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#f6c453'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-16, -16)
  ctx.lineTo(16, 16)
  ctx.moveTo(16, -16)
  ctx.lineTo(-16, 16)
  ctx.stroke()
  ctx.fillStyle = '#f6c453'
  ctx.beginPath()
  ctx.moveTo(0, -18)
  ctx.lineTo(7, 8)
  ctx.lineTo(0, 4)
  ctx.lineTo(-7, 8)
  ctx.closePath()
  ctx.fill()
  return canvas.toDataURL()
}

function pinIcon(index: number, color: string, selected: boolean): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 84
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = selected ? '#fff4d2' : color
  ctx.beginPath()
  ctx.arc(32, 26, 22, Math.PI, 0)
  ctx.bezierCurveTo(54, 40, 40, 58, 32, 76)
  ctx.bezierCurveTo(24, 58, 10, 40, 10, 26)
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = selected ? 4 : 2
  ctx.strokeStyle = '#142018'
  ctx.stroke()
  ctx.fillStyle = '#142018'
  ctx.font = 'bold 18px "WenQuanYi Micro Hei", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(index), 32, 28)
  return canvas.toDataURL()
}

export class FlightScene {
  readonly viewer: Cesium.Viewer
  private handlers: SceneHandlers
  private position: Cesium.SampledPositionProperty | null = null
  private heading = 0
  private follow = true
  private playing = false
  private suspendFollow = false
  private speed = 16
  private trackPoints: Cesium.Cartesian3[] = []
  private removed = false
  private readonly removeTick: Cesium.Event.RemoveCallback
  private readonly clickHandler: Cesium.ScreenSpaceEventHandler
  private readonly droneImage = droneIcon()

  constructor(container: HTMLElement, handlers: SceneHandlers) {
    this.handlers = handlers
    this.viewer = new Cesium.Viewer(container, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: new Cesium.ImageryLayer(
        imagery(SATELLITE, '影像：Esri、Maxar、Earthstar Geographics'),
      ),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      contextOptions: {
        webgl: { preserveDrawingBuffer: true },
      },
    })
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a241c')
    this.viewer.scene.globe.depthTestAgainstTerrain = false
    this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20
    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas)
    this.clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = this.viewer.scene.pick(movement.position)
      const entity = picked && (picked as { id?: Cesium.Entity }).id
      const id = entity?.id
      if (id?.startsWith('photo:')) this.handlers.onSelect(id.slice('photo:'.length))
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    this.removeTick = this.viewer.clock.onTick.addEventListener(() => this.handleTick())
  }

  setBasemap(kind: Basemap): void {
    this.viewer.imageryLayers.removeAll(true)
    const url = kind === 'satellite' ? SATELLITE : STREETS
    const credit = kind === 'satellite' ? '影像：Esri、Maxar、Earthstar Geographics' : '地图：Esri'
    this.viewer.imageryLayers.addImageryProvider(imagery(url, credit))
  }

  setFollow(follow: boolean, snap = true): void {
    this.follow = follow
    if (!follow) this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    else if (snap) {
      this.updateHeading()
      this.applyFollow()
    }
  }

  setSpeed(multiplier: number): void {
    this.speed = multiplier
    this.viewer.clock.multiplier = multiplier
  }

  play(): void {
    if (!this.position) return
    const clock = this.viewer.clock
    if (Cesium.JulianDate.compare(clock.currentTime, clock.stopTime) >= 0) {
      clock.currentTime = clock.startTime.clone()
    }
    this.suspendFollow = false
    this.playing = true
    clock.shouldAnimate = true
    clock.multiplier = this.speed
  }

  pause(): void {
    this.playing = false
    this.viewer.clock.shouldAnimate = false
  }

  seek(progress: number): void {
    if (!this.position) return
    const clock = this.viewer.clock
    const span = Cesium.JulianDate.secondsDifference(clock.stopTime, clock.startTime)
    clock.currentTime = Cesium.JulianDate.addSeconds(
      clock.startTime,
      Math.min(1, Math.max(0, progress)) * span,
      new Cesium.JulianDate(),
    )
  }

  setTrack(track: Track | null): void {
    this.viewer.entities.removeAll()
    this.position = null
    this.trackPoints = []
    this.viewer.clock.shouldAnimate = false
    this.playing = false
    if (!track || track.points.length < 2) return

    const position = new Cesium.SampledPositionProperty()
    position.setInterpolationOptions({
      interpolationDegree: 1,
      interpolationAlgorithm: Cesium.LinearApproximation,
    })
    const air: Cesium.Cartesian3[] = []
    const ground: Cesium.Cartesian3[] = []
    for (const point of track.points) {
      const cartesian = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.alt)
      air.push(cartesian)
      ground.push(Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0.4))
      position.addSample(Cesium.JulianDate.fromDate(point.time), cartesian)
    }
    this.position = position
    this.trackPoints = air
    const start = Cesium.JulianDate.fromDate(track.points[0].time)
    const stop = Cesium.JulianDate.fromDate(track.points[track.points.length - 1].time)
    this.viewer.clock.startTime = start.clone()
    this.viewer.clock.stopTime = stop.clone()
    this.viewer.clock.currentTime = start.clone()
    this.viewer.clock.clockRange = Cesium.ClockRange.CLAMPED
    this.viewer.clock.multiplier = this.speed
    this.viewer.clock.shouldAnimate = false

    this.viewer.entities.add({
      id: 'track-air',
      polyline: {
        positions: air,
        width: 3,
        material: Cesium.Color.fromCssColorString('#f0b429'),
        arcType: Cesium.ArcType.NONE,
      },
    })
    this.viewer.entities.add({
      id: 'track-ground',
      polyline: {
        positions: ground,
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.WHITE.withAlpha(0.55),
          dashLength: 16,
        }),
      },
    })
    this.viewer.entities.add({
      id: 'drone',
      position,
      billboard: {
        image: this.droneImage,
        width: 42,
        height: 42,
        rotation: new Cesium.CallbackProperty(() => -this.heading, false),
        alignedAxis: Cesium.Cartesian3.ZERO,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    this.viewer.entities.add({
      id: 'drone-drop',
      polyline: {
        positions: new Cesium.CallbackProperty(() => this.dropLine(), false),
        width: 1.5,
        material: Cesium.Color.fromCssColorString('#ffe7a3').withAlpha(0.9),
        arcType: Cesium.ArcType.NONE,
      },
    })
    this.frameAll()
  }

  setPhotos(photos: DefectPhoto[], selectedId: string | null): void {
    const stale = this.viewer.entities.values.filter((entity) => entity.id.startsWith('photo:'))
    for (const entity of stale) this.viewer.entities.remove(entity)
    photos.forEach((photo, index) => {
      const selected = photo.id === selectedId
      this.viewer.entities.add({
        id: `photo:${photo.id}`,
        position: Cesium.Cartesian3.fromDegrees(photo.lon, photo.lat, 1.2),
        billboard: {
          image: pinIcon(index + 1, SEVERITY_COLOR[photo.severity], selected),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          width: selected ? 42 : 34,
          height: selected ? 56 : 46,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    })
  }

  flyToPhoto(photo: DefectPhoto): void {
    this.suspendFollow = true
    this.follow = false
    this.playing = false
    this.viewer.clock.shouldAnimate = false
    this.handlers.onFollowChange(false)
    this.viewer.camera.cancelFlight()
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    const destination = Cesium.Cartesian3.fromDegrees(photo.lon, photo.lat - 0.00055, 320)
    this.viewer.camera.flyTo({
      destination,
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-52),
        roll: 0,
      },
      duration: 1.15,
      complete: () => {
        this.suspendFollow = false
      },
      cancel: () => {
        this.suspendFollow = false
      },
    })
  }

  frameAll(): void {
    if (this.trackPoints.length === 0) return
    const sphere = Cesium.BoundingSphere.fromPoints(this.trackPoints)
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    this.viewer.camera.viewBoundingSphere(
      sphere,
      new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-48), Math.max(sphere.radius * 3.1, 500)),
    )
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  }

  captureOverview(): string {
    const camera = this.viewer.camera
    const saved = {
      destination: camera.positionWC.clone(),
      direction: camera.directionWC.clone(),
      up: camera.upWC.clone(),
    }
    this.frameAll()
    this.viewer.scene.render()
    let url = ''
    try {
      url = this.viewer.canvas.toDataURL('image/jpeg', 0.72)
    } catch {
      url = ''
    }
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    camera.setView({
      destination: saved.destination,
      orientation: { direction: saved.direction, up: saved.up },
    })
    return url
  }

  destroy(): void {
    if (this.removed) return
    this.removed = true
    this.removeTick()
    this.clickHandler.destroy()
    this.viewer.destroy()
  }

  private dropLine(): Cesium.Cartesian3[] {
    const current = this.currentPosition()
    if (!current) return []
    const carto = Cesium.Cartographic.fromCartesian(current)
    return [Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0), current]
  }

  private currentPosition(): Cesium.Cartesian3 | undefined {
    if (!this.position) return undefined
    return this.position.getValue(this.viewer.clock.currentTime)
  }

  private applyFollow(): void {
    const current = this.currentPosition()
    if (!current) return
    this.viewer.camera.lookAt(
      current,
      new Cesium.HeadingPitchRange(this.heading, Cesium.Math.toRadians(-42), 280),
    )
  }

  private updateHeading(): void {
    if (!this.position) return
    const time = this.viewer.clock.currentTime
    const current = this.position.getValue(time)
    const ahead = this.position.getValue(Cesium.JulianDate.addSeconds(time, 2.5, new Cesium.JulianDate()))
    if (!current || !ahead || Cesium.Cartesian3.distance(current, ahead) < 0.4) return
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(current)
    const inverse = Cesium.Matrix4.inverse(transform, new Cesium.Matrix4())
    const local = Cesium.Matrix4.multiplyByPoint(inverse, ahead, new Cesium.Cartesian3())
    this.heading = Math.atan2(local.x, local.y)
  }

  private handleTick(): void {
    this.updateHeading()
    if (this.follow && this.playing && !this.suspendFollow) this.applyFollow()
    const clock = this.viewer.clock
    const span = Cesium.JulianDate.secondsDifference(clock.stopTime, clock.startTime)
    const elapsed = Cesium.JulianDate.secondsDifference(clock.currentTime, clock.startTime)
    const progress = span > 0 ? Math.min(1, Math.max(0, elapsed / span)) : 0
    if (this.playing && progress >= 0.999) {
      this.playing = false
      clock.shouldAnimate = false
    }
    const jsDate = Cesium.JulianDate.toDate(clock.currentTime)
    this.handlers.onTick({
      progress,
      time: this.position ? jsDate : null,
      playing: this.playing,
    })
  }
}
