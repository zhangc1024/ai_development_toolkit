import { fadeStops, gradientLine, placement, type Transform } from './core'
export interface Settings {
  fusion: 'full' | 'gradient'; angle: number; sceneOpacity: number
  blend: 'source-over' | 'screen' | 'multiply' | 'overlay'
  portrait: Transform; scene: Transform; center: number; softness: number
  opacity: number; tint: string; tintStrength: number; background: string
}
export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  return canvas
}
export function render(target: HTMLCanvasElement, portrait: HTMLCanvasElement, scene: HTMLCanvasElement | undefined, settings: Settings) {
  const { width, height } = target
  const ctx = target.getContext('2d')!
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = settings.background; ctx.fillRect(0, 0, width, height)
  const mask = makeCanvas(width, height), m = mask.getContext('2d')!
  const p = placement(portrait.width, portrait.height, width, height, settings.portrait)
  m.drawImage(portrait, p.x, p.y, p.width, p.height)
  const layer = makeCanvas(width, height), l = layer.getContext('2d')!
  l.drawImage(mask, 0, 0)
  l.globalCompositeOperation = 'source-atop'; l.globalAlpha = settings.tintStrength
  l.fillStyle = settings.tint; l.fillRect(0, 0, width, height)
  l.globalAlpha = 1; l.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = settings.opacity; ctx.drawImage(layer, 0, 0); ctx.globalAlpha = 1
  if (scene) {
    l.clearRect(0, 0, width, height)
    const s = placement(scene.width, scene.height, width, height, settings.scene, true)
    l.drawImage(scene, s.x, s.y, s.width, s.height)
    if (settings.fusion === 'gradient') {
      const [start, end] = fadeStops(settings.center, settings.softness)
      const { x0, y0, x1, y1 } = gradientLine(width, height, settings.angle)
      const gradient = l.createLinearGradient(x0, y0, x1, y1)
      gradient.addColorStop(start, 'rgba(0,0,0,0)'); gradient.addColorStop(end, '#000')
      l.globalCompositeOperation = 'destination-in'; l.fillStyle = gradient; l.fillRect(0, 0, width, height)
    }
    l.globalCompositeOperation = 'destination-in'; l.drawImage(mask, 0, 0); l.globalCompositeOperation = 'source-over'
    ctx.save(); ctx.globalAlpha = settings.sceneOpacity; ctx.globalCompositeOperation = settings.blend
    ctx.drawImage(layer, 0, 0); ctx.restore()
  }
  mask.width = mask.height = layer.width = layer.height = 1
}
