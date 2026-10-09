import { existsSync, copyFileSync, symlinkSync, chmodSync } from "node:fs";
if(!existsSync(".env.local")){copyFileSync(".env.example",".env.local");chmodSync(".env.local",0o600);}
if(!existsSync(".dev.vars"))symlinkSync(".env.local",".dev.vars");
console.log("已准备 .env.local；填写服务端密钥后运行 npm run dev。凭证不会进入源码仓库。");
