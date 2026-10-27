import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { REFERRAL_BONUS } from "@/lib/config";
import { fmt } from "@/lib/ton";
import invitation from "@/assets/referral-invitation.jpg";
import { shareReferral } from "@/lib/referral-share";
import { GhostButton, PrimaryButton } from "@/components/ui-kit";

export const Route = createFileRoute("/referrals")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Orange — Invite friends" },
      { name: "description", content: "Invite friends to Orange and earn ORAI from their mining." },
      { property: "og:title", content: "Orange — Invite friends" },
      { property: "og:description", content: "Invite friends to Orange and earn ORAI from their mining." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Referrals,
});

const BOT_USERNAME = "sramaibot";

function Referrals() {
  const { data, t, lang } = useStore();
  if (!data) return null;
  const me = data.me;
  const ar = lang === "ar";
  const link = `https://t.me/${BOT_USERNAME}?start=ref_${me.id}`;
  return (
    <div className="space-y-4">
      <img src={invitation} alt={t("inviteFriends")} className="aspect-[3/2] w-full rounded-3xl object-cover" />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4 text-center"><div className="text-2xl font-bold tabular-nums">{data.referrals.length}</div><div className="mt-1 text-xs text-muted-foreground">{t("friends")}</div></div>
        <div className="rounded-2xl bg-card p-4 text-center"><div className="truncate text-2xl font-bold tabular-nums text-primary" dir="ltr">{fmt(Number(me.referral_earned ?? 0), 2)}</div><div className="mt-1 text-xs text-muted-foreground">ORAI</div></div>
      </div>
      <p className="px-2 text-center text-sm text-muted-foreground">{ar ? `اربح 10% من تعدين أصدقائك + ${REFERRAL_BONUS} ORAI لكل دعوة` : `Earn 10% of friends' mining + ${REFERRAL_BONUS} ORAI per invite`}</p>
      <div className="divide-y divide-border border-y border-border">{[{label: ar ? "دخول صديقك" : "Friend joins", amount: 5}, {label: ar ? "تأكيد ملكية المحفظة" : "Wallet verified", amount: 10}, {label: ar ? "استلام التعدين مرتين" : "Two mining claims", amount: 10}].map(stage => <div key={stage.label} className="flex justify-between py-3 text-sm"><span>{stage.label}</span><span dir="ltr">+{stage.amount} ORAI</span></div>)}</div>
      <PrimaryButton onClick={() => shareReferral(invitation, link, lang).catch(() => toast.error(t("pending")))}>{t("inviteFriends")}</PrimaryButton>
      <GhostButton className="w-full font-bold" onClick={() => { navigator.clipboard.writeText(link); toast(t("copied")); }}>{t("copyLink")}</GhostButton>
      {data.referrals.length > 0 && <div className="overflow-hidden rounded-2xl bg-card">
        {data.referrals.map((r: any, i: number) => (
          <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-muted" : ""}`}>
            <div className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{(r.first_name || r.username || "?").slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate font-bold">{r.first_name || r.username}</div><div className="mt-1 text-xs text-muted-foreground">{[r.referral_signup_paid, r.referral_wallet_paid, r.referral_mining_paid].filter(Boolean).length}/3 · {ar ? "مراحل مكتملة" : "stages completed"}</div></div>
          </div>
        ))}
      </div>}
    </div>
  );
}
