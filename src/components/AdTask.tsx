import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { beginAd, adProgress } from "@/lib/ads.functions";
import { GhostButton, PrimaryButton } from "@/components/ui-kit";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
type AdWindow = Window & { show_11951290?: (options: {ymid:string}) => Promise<unknown> };
async function loadSdk() {
 const w = window as AdWindow;
 if(w.show_11951290) return w.show_11951290;
 await new Promise<void>((resolve,reject)=>{
 const old = document.getElementById("monetag-sdk"); if(old) old.remove();
 const script = document.createElement("script"); script.id="monetag-sdk"; script.src="https://libtl.com/sdk.js"; script.dataset['zone']="11951290"; script.dataset['sdk']="show_11951290"; script.onload=()=>resolve(); script.onerror=()=>{script.remove();reject(new Error("الإعلان غير متاح دلوقتي"));}; document.head.appendChild(script);
 });
 if(!w.show_11951290) throw new Error("الإعلان غير متاح دلوقتي");
 return w.show_11951290;
}
export function AdTask() {
 const { demo, initData, t } = useStore(); const [count,setCount] = useState(0),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!demo) adProgress({data:{initData}}).then(r=>setCount(r.count)).catch(()=>{});},[demo,initData]);
 async function watch() { if(demo){toast(t("openInTelegram"));return;} setBusy(true); try { const show = await loadSdk(); const {id}=await beginAd({data:{initData}}); setOpen(false); await show({ymid:id}); let verified=false; for(let i=0;i<6;i++){ const r=await adProgress({data:{initData}});setCount(r.count); if(r.count>count){verified=true;break;} await new Promise(r=>setTimeout(r,2000)); } toast(verified ? "تم تأكيد الإعلان" : "في انتظار تأكيد Monetag"); } catch(e){toast.error(e instanceof Error ? e.message : "تعذر عرض الإعلان");}finally{setBusy(false);} }
 return <section className="mb-5 border-y border-border py-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Monetag</h2><p className="mt-1 text-xs text-muted-foreground">إعلانات السحب المؤكدة · {Math.min(count,5)}/5</p></div><GhostButton onClick={()=>setOpen(true)} disabled={busy} className="flex items-center gap-2"><Play className="size-4" />{busy ? "جاري التأكيد" : "شاهد إعلان"}</GhostButton></div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>مشاهدة إعلان Monetag</DialogTitle><DialogDescription>بموافقتك هيتعرض إعلان بملء الشاشة. مفيش إعلانات تلقائية، ومش مطلوب تضغط على إعلان المعلن.</DialogDescription><PrimaryButton onClick={watch} disabled={busy}>أوافق · عرض الإعلان</PrimaryButton><GhostButton onClick={()=>setOpen(false)}>إلغاء</GhostButton></DialogContent></Dialog></section>;
}
