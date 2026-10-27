export async function telegramApi(method: string, body: object) {
 const key=process.env['TELEGRAM_API_KEY'],apiKey=process.env['LOVABLE_API_KEY'];
 if(!key||!apiKey)throw new Error('Telegram connection is not configured');
 const response=await fetch(`https://connector-gateway.lovable.dev/telegram/${method}`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'X-Connection-Api-Key':key,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok){const text=await response.text();console.error('Telegram request failed',response.status,text);throw new Error(`Telegram request failed [${response.status}]: ${text}`);}
 const result=await response.json() as {ok:boolean;result?:any;error_code?:number;description?:string;parameters?:{retry_after?:number}};
 return result;
}
export async function webhookSecret(){const key=process.env['TELEGRAM_API_KEY'];if(!key)throw new Error('Telegram is not connected');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`telegram-webhook:${key}`));return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export const APP_URL='https://orangeorai.vercel.app';
export const APP_BUTTON_EMOJI='5875465628285931233';
export const STAR_EMOJI='5958376256788502078';