import { calendar, completedCutoff } from "../../../lib/market/providers";
import { runtime, reply } from "../../../lib/market/server";
export async function GET(){
 const config=runtime(),cutoff=completedCutoff();let latest=cutoff.cutoff,calendarStatus="unconfigured";
 if(config.FUYAO_API_KEY){try{const dates=await calendar(config.FUYAO_API_KEY);latest=dates.filter(d=>d<=cutoff.cutoff).at(-1)||latest;calendarStatus="available";}catch{calendarStatus="failed";}}
 return reply({fuyaoConfigured:!!config.FUYAO_API_KEY?.trim(),modelConfigured:!!config.DEEPSEEK_API_KEY?.trim(),model:config.DEEPSEEK_MODEL||"deepseek-flash",latestCompletedDate:latest,today:cutoff.today,calendarStatus,replay:{from:"2026-06-01",to:"2026-08-31"}});
}
