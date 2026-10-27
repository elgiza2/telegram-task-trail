import { AdTask } from "@/components/AdTask";
import { ShareTasks } from "@/components/ShareTasks";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { completeTask } from "@/lib/api.functions";
import { REFERRAL_BONUS } from "@/lib/config";
import { openLink, haptic } from "@/lib/telegram";
import { fmt } from "@/lib/ton";
import invitation from "@/assets/referral-invitation.jpg";
import { shareReferral } from "@/lib/referral-share";
import { CoinIcon, GhostButton, ORAI_ICON, PrimaryButton, Segmented } from "@/components/ui-kit";

export const Route = createFileRoute("/tasks")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Orange — Tasks" },
      { name: "description", content: "Complete tasks and invite friends to earn ORAI." },
      { property: "og:title", content: "ORAI Tasks" },
      { property: "og:description", content: "Complete tasks and invite friends to earn ORAI." },
    ],
  }),
  component: Tasks,
});

const BOT_USERNAME = "sramaibot";

function Tasks() {
  const { data, t, x, initData, demo, setData, lang } = useStore();
  const tab = "tasks" as const;
  const [app, setApp] = useState<string | null>(null);
  const [cat, setCat] = useState<"ours" | "partners" | "others">("ours");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const waiting = useRef<any>(null);
  useEffect(() => {
    const onFocus = () => { const task = waiting.current; if (task) { waiting.current = null; void claim(task, true); } };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  });
  if (!data) return null;
  const me = data.me;
  const link = `https://t.me/${BOT_USERNAME}?start=ref_${me.id}`;
  const pending = data.tasks.filter((task: any) => !data.done.includes(task.id) && (task.app_category || "ours") === cat);
  const apps = new Map<string, { name: string; image: string | null; tasks: any[] }>();
  for (const task of pending) if (task.app_name) {
    const a = apps.get(task.app_name) ?? { name: task.app_name, image: task.app_image || task.image_url, tasks: [] as any[] };
    a.tasks.push(task); apps.set(task.app_name, a);
  }
  const shown = pending.filter((task: any) => !task.app_name);

  async function claim(task: any, silent = false) {
    if (demo) { toast(t("openInTelegram")); return; }
    try {
      const r = await completeTask({ data: { initData, taskId: task.id } });
      setData((d) => d && { ...d, me: { ...d.me, balance: r.balance, power_level: r.power_level }, done: [...d.done, task.id] });
      haptic("success");
      toast.success(`+${fmt(task.reward)} ORAI · +2 tickets`);
    } catch (e: any) {
      if (!silent) toast.error(e?.message === "TASK_NOT_VERIFIED" ? x("taskNotVerified") : e.message);
    }
  }
  function onTask(task: any) {
    if (!opened[task.id]) {
      openLink(task.link);
      setOpened((o) => ({ ...o, [task.id]: true }));
      waiting.current = task;
      return;
    }
    void claim(task);
  }
  const ar = lang === "ar";
  return (
    <div>
      {tab === "tasks" && <div className="mb-3"><Segmented value={cat} onChange={(v) => { setCat(v); setApp(null); }} options={[
        { key: "ours", label: ar ? "مهامنا" : "Our tasks" },
        { key: "partners", label: ar ? "الشركاء" : "Partners" },
        { key: "others", label: ar ? "آخرون" : "Others" },
      ]} /></div>}
      {cat === "others" && <AdTask />}
      {cat === "ours" && tab === "tasks" && <ShareTasks />}
      {tab === "tasks" ? (
        pending.length === 0
          ? <div className="rounded-2xl bg-card py-12 text-center text-sm font-bold text-muted-foreground">{x("allDone")}</div>
          : <div className="space-y-3">
            {[...apps.values()].map((a) => (
              <div key={a.name}>
                <GhostButton aria-expanded={app === a.name} onClick={() => setApp(app === a.name ? null : a.name)} className="flex h-auto min-h-20 w-full items-center gap-3 p-3 text-start">
                  <CoinIcon src={a.image || ORAI_ICON} className="size-12" />
                  <span className="min-w-0 flex-1 truncate font-bold">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.tasks.length}</span>
                  <span aria-hidden="true">{app === a.name ? "−" : "+"}</span>
                </GhostButton>
                {app === a.name && <div className="mt-2 divide-y divide-muted">
                  {a.tasks.map((task: any) => <div key={task.id} className="flex items-center gap-3 px-2 py-3">
                    <CoinIcon src={a.image || ORAI_ICON} className="size-10" />
                    <span className="min-w-0 flex-1 break-words font-bold">{task.title_i18n?.[lang] || task.title}<span className="mt-1 block text-xs text-muted-foreground">+2 tickets</span></span>
                    <GhostButton onClick={() => onTask(task)} className="shrink-0">{opened[task.id] ? t("claim") : t("start")}</GhostButton>
                  </div>)}
                </div>}
              </div>
            ))}
            {shown.length > 0 && <div className="overflow-hidden rounded-2xl bg-card">
            {shown.map((task: any, i: number) => (
              <div key={task.id} className={`flex items-center gap-3 px-4 py-3.5 ${i ? "border-t border-muted" : ""}`}>
                <CoinIcon src={task.image_url || ORAI_ICON} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{task.title_i18n?.[lang] || task.title}</div>
                  <div className="mt-0.5 text-xs font-bold text-muted-foreground" dir="ltr">ORAI</div>
                </div>
                <button onClick={() => onTask(task)}
                  className={`h-9 shrink-0 rounded-full px-4 text-xs font-bold transition active:scale-95 ${opened[task.id] ? "btn-orange" : "bg-accent text-primary"}`} dir="ltr">
                  {opened[task.id] ? t("claim") : `+${fmt(task.reward)}`}
                </button>
              </div>
            ))}
          </div>}
          </div>
      ) : null}
    </div>
  );
}
