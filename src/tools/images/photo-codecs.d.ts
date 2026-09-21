declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: (options?: Record<string, unknown>) => Promise<any>
  export default factory
}
declare module 'utif' {
  const UTIF: {
    decode(buffer: ArrayBuffer): any[]
    decodeImage(buffer: ArrayBuffer, image: any, images?: any[]): void
    toRGBA8(image: any): Uint8Array
    encodeImage(rgba: ArrayBuffer, width: number, height: number, metadata?: Record<string, unknown>): ArrayBuffer
  }
  export default UTIF
}
