import { env } from "cloudflare:workers";
import { z } from "zod";
import { INDICES } from "./types";
import type { RuntimeConfig } from "./providers";
export const requestSchema=z.object({index:z.string().refine(code=>INDICES.some(i=>i.code===code),"不支持的指数"),window:z.union([z.literal(20),z.literal(60)]),asOf:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+"T00:00:00+08:00");return Number.isFinite(date.getTime())&&new Date(date.getTime()+8*3600_000).toISOString().slice(0,10)===value;},"无效日期"),mode:z.enum(["replay","official","fuyao"]),question:z.string().trim().max(500).optional()}).strict();
export const runtime=()=>env as unknown as RuntimeConfig;
export const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export class RequestError extends Error{constructor(message:string,public status:number){super(message);}}
export async function readBody(request:Request){
 const length=Number(request.headers.get("content-length"));if(length>12_000)throw new RequestError("请求内容过大。",413);
 const reader=request.body?.getReader();if(!reader)throw new RequestError("请求内容为空。",400);
 const chunks:Uint8Array[]=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>12_000){await reader.cancel();throw new RequestError("请求内容过大。",413);}chunks.push(value);}
 const buffer=new Uint8Array(total);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(buffer));}catch{throw new RequestError("请求JSON格式无效。",400);}
}
export const isFuture=(date:string)=>date>new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
export function isSameOrigin(request:Request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin;}
