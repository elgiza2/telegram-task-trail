import { useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { beginAd } from "@/lib/ads.functions";
import { loadSdk } from "@/components/AdTask";
import { GhostButton } from "@/components/ui-kit";

export function WithdrawalAds() {
  const { initData, demo } = useStore();
  const [busy, setBusy] = useState(false);
  async function watch() {
    if (demo) { toast("Open Orange in Telegram to watch ads."); return; }
    setBusy(true);
    try {
      const show = await loadSdk();
      const { id } = await beginAd({ data: { initData } });
      await show({ ymid: id });
      toast("Ad finished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to show ad");
    } finally { setBusy(false); }
  }
  return <div className="border-y border-border py-3"><GhostButton onClick={watch} disabled={busy} className="flex w-full items-center justify-center gap-2"><Play className="size-4" />{busy ? "Opening ad…" : "Watch an ad"}</GhostButton></div>;
}
