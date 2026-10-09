import type { Report } from "./types";
function calculationInputs(inputs:unknown):unknown{
 if(Array.isArray(inputs))return inputs.map(calculationInputs);
 if(inputs&&typeof inputs==="object")return Object.fromEntries(Object.entries(inputs).filter(([key])=>!["retrievedAt","endpoint","timestamp"].includes(key)).map(([key,value])=>[key,calculationInputs(value)]));
 return inputs;
}
export async function snapshotFingerprint(report:Report){
 const canonical={index:report.request.index,window:report.request.window,mode:report.request.mode,asOf:report.asOf,metrics:report.metrics,evidence:report.evidence.map(e=>({id:e.id,status:e.status,value:e.value,scope:e.scope,asOf:e.asOf,inputs:calculationInputs(e.inputs)}))};
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canonical)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
