import { describe, expect, it } from 'vitest'
import { fadeStops, placement, removeConnectedBackground } from '../src/tools/double-exposure/core'

describe('double exposure geometry', () => {
  it('contains portrait without distortion and covers with scenery', () => {
    const t = { x: 0, y: 0, scale: 1 }
    expect(placement(200, 100, 100, 150, t)).toEqual({ x: 0, y: 50, width: 100, height: 50 })
    expect(placement(200, 100, 100, 150, t, true)).toEqual({ x: -100, y: 0, width: 300, height: 150 })
    expect(placement(200, 100, 100, 150, { x: .1, y: -.2, scale: 2 })).toEqual({ x: -40, y: -5, width: 200, height: 100 })
  })
  it('rejects invalid dimensions and transformations', () => {
    expect(() => placement(0, 100, 100, 100, { x: 0, y: 0, scale: 1 })).toThrow()
    expect(() => placement(100, 100, 100, 100, { x: NaN, y: 0, scale: 1 })).toThrow()
  })
  it('keeps gradient stops inside canvas at both extremes', () => {
    expect(fadeStops(0, .4)).toEqual([0, .2])
    expect(fadeStops(1, .4)).toEqual([.8, 1])
    expect(fadeStops(.5, .4)).toEqual([.3, .7])
  })
})
describe('connected background removal', () => {
  const white = [255, 255, 255, 255], black = [0, 0, 0, 255]
  it('preserves enclosed matching pixels and the original data', () => {
    const pixels = new Uint8ClampedArray([
      ...white, ...white, ...white, ...white, ...white,
      ...white, ...black, ...black, ...black, ...white,
      ...white, ...black, ...white, ...black, ...white,
      ...white, ...black, ...black, ...black, ...white,
      ...white, ...white, ...white, ...white, ...white,
    ])
    const result = removeConnectedBackground(pixels, 5, 5, 0, 10)
    expect(result[3]).toBe(0)
    expect(result[12 * 4 + 3]).toBe(255)
    expect(result[6 * 4 + 3]).toBe(255)
    expect(pixels[3]).toBe(255)
  })
  it('does not wrap between rows or connect diagonals', () => {
    const pixels = new Uint8ClampedArray([...black, ...white, ...white, ...black])
    const result = removeConnectedBackground(pixels, 2, 2, 1, 0)
    expect(result[7]).toBe(0)
    expect(result[11]).toBe(255)
  })
  it('uses tolerance, allows transparent regions, validates seeds', () => {
    const pixels = new Uint8ClampedArray([...white, 240, 240, 240, 255, 0, 0, 0, 0])
    expect(removeConnectedBackground(pixels, 3, 1, 0, 15)[7]).toBe(0)
    expect(removeConnectedBackground(pixels, 3, 1, 0, 14)[7]).toBe(255)
    expect(() => removeConnectedBackground(pixels, 3, 1, 3, 10)).toThrow()
  })
})

import { inspectExposureImage } from '../src/tools/double-exposure/import'

describe('photograph import limits', () => {
  function jpegHeader(width: number, height: number) {
    return new Uint8Array([255,216,255,192,0,17,8,height >> 8,height & 255,width >> 8,width & 255,3,1,17,0,2,17,0,3,17,0,255,217])
  }
  it('accepts common 24 MP and 48 MP JPEG dimensions before decoding', () => {
    expect(inspectExposureImage(jpegHeader(6000,4000))).toMatchObject({width:6000,height:4000})
    expect(inspectExposureImage(jpegHeader(8000,6000))).toMatchObject({width:8000,height:6000})
  })
  it('rejects photos above 64 MP before decoding', () => {
    expect(() => inspectExposureImage(jpegHeader(10000,8000))).toThrow('6400')
  })
  it('retains file size and static format validation', () => {
    expect(() => inspectExposureImage(new Uint8Array(10 * 1024 * 1024 + 1))).toThrow('10 MiB')
    expect(() => inspectExposureImage(new Uint8Array([71,73,70,56,57,97]))).toThrow('静态')
    expect(() => inspectExposureImage(new Uint8Array([255,216,255]))).toThrow()
  })
})

import { gradientLine } from '../src/tools/double-exposure/core'
describe('fusion direction', () => {
  it.each([
    [0, 0, 150, 200, 150], [90, 100, 0, 100, 300],
    [180, 200, 150, 0, 150], [270, 100, 300, 100, 0],
  ])('points gradient %i degrees toward scenery', (angle, x0, y0, x1, y1) => {
    const line = gradientLine(200, 300, angle)
    expect(line.x0).toBeCloseTo(x0); expect(line.y0).toBeCloseTo(y0)
    expect(line.x1).toBeCloseTo(x1); expect(line.y1).toBeCloseTo(y1)
  })
})
