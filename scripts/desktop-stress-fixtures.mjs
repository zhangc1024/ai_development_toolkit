import { createDeflate, deflateSync } from 'node:zlib'
import { Readable } from 'node:stream'
import { writeFile, mkdir, truncate, open, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js'
const out=resolve('output/desktop-stress/samples');await mkdir(out,{recursive:true})
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]),h=Buffer.alloc(4),t=Buffer.alloc(4);h.writeUInt32BE(data.length);t.writeUInt32BE(crc(body));return Buffer.concat([h,body,t])}
async function png(width,height,name){
 const row=Buffer.alloc(width*4+1);for(let x=0;x<width;x++){row[x*4+1]=x%256;row[x*4+2]=Math.floor(x/31)%256;row[x*4+3]=128;row[x*4+4]=255}
 const stream=createDeflate({level:1});Readable.from((function*(){for(let y=0;y<height;y++)yield row})()).pipe(stream)
 const parts=[];for await(const part of stream)parts.push(part)
 const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',Buffer.concat(parts)),chunk('IEND',Buffer.alloc(0))])
 await writeFile(join(out,name),bytes);return bytes
}
const image=await png(8000,8000,'6400万像素.png')
await png(8001,8000,'超过像素上限.png')
const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,zip64:false,lastModDate:new Date(2026,0,1),extendedTimestamp:false})
await writer.add('随机保留.bin',new Uint8ArrayReader(randomBytes(40*1024*1024)),{level:0})
await writer.add('大文本.txt',new Uint8ArrayReader(Buffer.alloc(140*1024*1024,65)),{level:1})
await writer.add('图片/6400万像素.png',new Uint8ArrayReader(image),{level:0})
for(let i=0;i<497;i++)await writer.add('条目/'+String(i).padStart(3,'0')+'.txt',new Uint8ArrayReader(Buffer.from('entry-'+i)),{level:0})
await writeFile(join(out,'500条目大混合.zip'),await writer.close())
const over=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,zip64:false})
await over.add('超限.txt',new Uint8ArrayReader(Buffer.alloc(201*1024*1024,66)),{level:1})
await writeFile(join(out,'超过展开上限.zip'),await over.close())
const many=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,zip64:false})
for(let i=0;i<501;i++)await many.add('item-'+i+'.txt',new Uint8ArrayReader(Buffer.from('x')),{level:0})
await writeFile(join(out,'501条目.zip'),await many.close())
const tooLarge=await open(join(out,'超过ZIP大小.zip'),'w');await tooLarge.truncate(51*1024*1024);await tooLarge.close()
const manifest=[]
for(const name of ['6400万像素.png','超过像素上限.png','500条目大混合.zip','超过展开上限.zip','501条目.zip','超过ZIP大小.zip']){
 const info=await stat(join(out,name));manifest.push({name,bytes:info.size,source:'synthetic geometry/random bytes/repeated text; no personal data',rights:'project-generated test data'})
}
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2))
console.log(JSON.stringify(manifest,null,2))
