import { fromBase64,toBase64 } from '../security/bytes'
export const MAX_IMAGE_BYTES=10*1024*1024
export const MAX_BASE64_CHARS=15*1024*1024
export function imageType(bytes:Uint8Array){
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw Error('图片必须非空且不超过 10 MiB')
 const has=(a:number[],offset=0)=>a.every((v,i)=>bytes[offset+i]===v)
 if(has([137,80,78,71,13,10,26,10]))return {mime:'image/png',ext:'png'}
 if(has([255,216,255]))return {mime:'image/jpeg',ext:'jpg'}
 if(has([71,73,70,56])&&[55,57].includes(bytes[4]!)&&bytes[5]===97)return {mime:'image/gif',ext:'gif'}
 if(has([82,73,70,70])&&has([87,69,66,80],8))return {mime:'image/webp',ext:'webp'}
 throw Error('仅支持 PNG、JPEG、GIF、WebP 图片；不支持 SVG 或其他文件')
}
export function decodeImageBase64(input:string){
 if(input.length>MAX_BASE64_CHARS)throw Error('Base64 文本超过 15 MiB')
 let text=input.trim(),declared=''
 if(/^data:/i.test(text)){
  const match=/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([\s\S]*)$/i.exec(text)
  if(!match)throw Error('需要 PNG/JPEG/GIF/WebP 的 Base64 Data URL，不支持远程 URL 或 SVG')
  declared=match[1]!.toLowerCase().replace('image/jpg','image/jpeg');text=match[2]!
 }
 const bytes=fromBase64(text.replace(/[ \t\r\n]/g,''))
 const type=imageType(bytes)
 if(declared&&declared!==type.mime)throw Error('Data URL 声明类型与图片文件头不一致')
 return {bytes,...type}
}
export function encodeImage(bytes:Uint8Array){const type=imageType(bytes);const base64=toBase64(bytes);return {...type,base64,dataUrl:'data:'+type.mime+';base64,'+base64}}
export function validateDimensions(width:number,height:number){
 if(!width||!height||width*height>16000000||width>16384||height>16384)throw Error('图片尺寸超过限制：最多 1600 万像素，任一边不超过 16384')
}
