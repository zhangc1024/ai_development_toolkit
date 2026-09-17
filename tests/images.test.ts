import { it,expect,describe } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { decodeImageBase64,encodeImage,imageType,validateDimensions,MAX_IMAGE_BYTES,MAX_BASE64_CHARS } from '../src/tools/images/core'
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,1,2,3,255])
describe('image byte conversion',()=>{
 it('byte exact roundtrip',()=>{const out=encodeImage(png);expect(out.mime).toBe('image/png');expect(decodeImageBase64(out.dataUrl).bytes).toEqual(png);expect(decodeImageBase64(out.base64).bytes).toEqual(png)})
 it('whitespace and omitted padding',()=>{const b=encodeImage(png).base64.replace(/=/g,'');expect(decodeImageBase64(' \n'+b.slice(0,4)+'\t'+b.slice(4)).bytes).toEqual(png)})
 it('mime mismatch',()=>expect(()=>decodeImageBase64('data:image/jpeg;base64,'+encodeImage(png).base64)).toThrow('不一致'))
 it('svg rejected',()=>expect(()=>decodeImageBase64('data:image/svg+xml;base64,PHN2Zz4=')).toThrow())
 for(const bad of ['','data:image/png,abc','https://example.com/a.png','%%%','abc===','_w==','AB=='])it('invalid '+bad,()=>expect(()=>decodeImageBase64(bad)).toThrow())
 for(const [bytes,mime] of [[[255,216,255],'image/jpeg'],[[71,73,70,56,57,97],'image/gif'],[[82,73,70,70,0,0,0,0,87,69,66,80],'image/webp']] as [number[],string][])it('signature '+mime,()=>expect(imageType(new Uint8Array(bytes)).mime).toBe(mime))
 it('unknown bytes rejected',()=>expect(()=>imageType(new Uint8Array([1,2,3]))).toThrow())
 it('byte limit',()=>expect(()=>imageType(new Uint8Array(MAX_IMAGE_BYTES+1))).toThrow('10 MiB'))
 it('text limit',()=>expect(()=>decodeImageBase64('a'.repeat(MAX_BASE64_CHARS+1))).toThrow('15 MiB'))
 it('dimensions valid',()=>expect(()=>validateDimensions(4000,4000)).not.toThrow())
 for(const [w,h] of [[0,1],[4001,4000],[16385,1]])it('dimensions '+w+'x'+h,()=>expect(()=>validateDimensions(w!,h!)).toThrow())
})
function raster(text:string,invert=false){
 const qr=QRCode.create(text,{errorCorrectionLevel:'M'});const scale=6,width=(qr.modules.size+8)*scale
 const pixels=new Uint8ClampedArray(width*width*4)
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
 const mx=Math.floor(x/scale)-4,my=Math.floor(y/scale)-4
 const dark=mx>=0&&my>=0&&mx<qr.modules.size&&my<qr.modules.size&&qr.modules.get(my,mx)
 const value=(invert?!dark:dark)?0:255;const offset=(y*width+x)*4
 pixels[offset]=pixels[offset+1]=pixels[offset+2]=value;pixels[offset+3]=255
 }
 return {pixels,width}
}
describe('local QR recognition',()=>{
 for(const text of ['hello','你好 😀','https://example.com','otpauth://totp/demo?secret=MY','<img src=x onerror=alert(1)>'])it(text,()=>{const r=raster(text);expect(jsQR(r.pixels,r.width,r.width,{inversionAttempts:'attemptBoth'})?.data).toBe(text)})
 it('inverted',()=>{const r=raster('inverted',true);expect(jsQR(r.pixels,r.width,r.width,{inversionAttempts:'attemptBoth'})?.data).toBe('inverted')})
 it('no QR',()=>expect(jsQR(new Uint8ClampedArray(100*100*4).fill(255),100,100)).toBeNull())
})
