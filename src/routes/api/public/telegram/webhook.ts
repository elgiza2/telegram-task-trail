import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
export const Route=createFileRoute('/api/public/telegram/webhook')({server:{handlers:{POST:async({request})=>{
 const {telegramApi,webhookSecret,APP_URL,APP_BUTTON_EMOJI,STAR_EMOJI}=await import('@/lib/telegram-api.server');
 const expected=await webhookSecret();
 if(request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==expected)return new Response('Unauthorized',{status:401});
 const parsed=z.object({update_id:z.number().int(),message:z.object({text:z.string().optional(),chat:z.object({id:z.number().int(),type:z.string()}),from:z.object({id:z.number().int(),username:z.string().optional(),first_name:z.string().optional()}).optional()}).optional()}).safeParse(await request.json());
 if(!parsed.success)return new Response('Invalid update',{status:400});const msg=parsed.data.message;if(!msg?.from||msg.chat.type!=='private')return Response.json({ok:true});
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:existing}=await db.from('orai_tg_users').select('id').eq('id',msg.from.id).maybeSingle();
 const param=msg.text?.split(' ')[1];let ref=param?.startsWith('ref_')?Number(param.slice(4)):null;
 if(ref===msg.from.id||!Number.isSafeInteger(ref))ref=null;
 if(ref){const {data:owner}=await db.from('orai_tg_users').select('id').eq('id',ref).maybeSingle();if(!owner)ref=null;}
 if(!existing){const {error}=await db.from('orai_tg_users').insert({id:msg.from.id,username:msg.from.username??null,first_name:msg.from.first_name??null,language_code:'en',referred_by:ref});if(error&&error.code!=='23505')return new Response('Retry',{status:503});}
 else await db.from('orai_tg_users').update({username:msg.from.username??null,first_name:msg.from.first_name??null}).eq('id',msg.from.id);
 const command=msg.text?.split(/\s/)[0]?.split('@')[0];
 if(command==='/101'){const {isAdminUsername}=await import('@/lib/config');if(!isAdminUsername(msg.from.username))return Response.json({ok:true});const r=await telegramApi('sendMessage',{chat_id:msg.chat.id,text:'<b>Orange Control Room</b>',parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Open admin panel',icon_custom_emoji_id:APP_BUTTON_EMOJI,web_app:{url:APP_URL+'/101'}}]]}});return Response.json({ok:r.ok});}
 if(command!=='/start')return Response.json({ok:true});
 const body={chat_id:msg.chat.id,photo:APP_URL+'/start-banner.jpg',caption:`<tg-emoji emoji-id="${STAR_EMOJI}">⭐</tg-emoji> <b>Welcome to Orange</b>\n\n<b>Your crew. Your next adventure.</b>\nMine ORAI, unlock rewards and play with free tickets.\n\nYour 2,000 ORAI welcome credit is ready.`,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Open Orange',icon_custom_emoji_id:APP_BUTTON_EMOJI,web_app:{url:APP_URL}}]]}};
 let r=await telegramApi('sendPhoto',body);
 if(!r.ok&&r.error_code===400)r=await telegramApi('sendPhoto',{...body,caption:'<b>Welcome to Orange</b>\n\n<b>Your crew. Your next adventure.</b>\nMine ORAI, unlock rewards and play with free tickets.\n\nYour 2,000 ORAI welcome credit is ready.',reply_markup:{inline_keyboard:[[{text:'Open Orange',web_app:{url:APP_URL}}]]}});
 return Response.json({ok:r.ok},{status:r.ok?200:503});
}}}});
