import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Image as ImageIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { getWebApp } from "@/lib/telegram";
import { prepareShareMessage } from "@/lib/share.functions";
import { GhostButton } from "@/components/ui-kit";

const APP = "https://orangeorai.vercel.app";

export function ShareTasks() {
  const { data, initData, demo } = useStore();
  const prepare = useServerFn(prepareShareMessage);
  if (!data) return null;
  const link = `https://t.me/sramaibot?start=ref_${data.me.id}`;
  const wa = getWebApp();

  function story() {
    if (demo || !wa?.shareToStory) { toast("Open Orange in Telegram to share a story."); return; }
    wa.shareToStory(`${APP}/start-banner.jpg`, {
      text: `Mining ORAI on Orange. Join my crew: ${link}`,
      widget_link: { url: link, name: "Open Orange" },
    });
  }
  async function message() {
    if (demo || !wa?.shareMessage) { toast("Open Orange in Telegram to share."); return; }
    try { const r = await prepare({ data: { initData } }); wa.shareMessage(r.id, (sent: boolean) => sent && toast.success("Shared")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Please try again"); }
  }
  const row = (Icon: typeof Send, title: string, sub: string, onClick: () => void) => (
    <GhostButton onClick={onClick} className="flex h-auto w-full items-center gap-3 p-3 text-start">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
      <span className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">Go</span>
    </GhostButton>
  );
  return <div className="mb-3 space-y-3">
    {row(ImageIcon, "Share Orange to your story", "Image and text are ready, just tap Post", story)}
    {row(Send, "Send Orange to 3 friends", "A message with image and Open button", message)}
  </div>;
}
