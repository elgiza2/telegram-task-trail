import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { SUPPORTER_URL } from "@/lib/config";
import { openLink } from "@/lib/telegram";
import { InfoPage, PrimaryButton } from "@/components/ui-kit";

export const Route = createFileRoute("/supporter")({ ssr: false, head: () => ({ meta: [
  { title: "Orange — Our supporter" }, { name: "description", content: "Megsy AI, the supporter of the Orange project." },
  { property: "og:title", content: "Orange Supporter" }, { property: "og:description", content: "Megsy AI, the supporter of the Orange project." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }
]}), component: Supporter });

function Supporter() {
  const { x, lang } = useStore();
  const ar = lang === "ar";
  const sections = [
    { h: "Who is the supporter?", p: "Orange is supported by Megsy AI — an AI platform offering smart chat, image and video generation, and website and code creation." },
    { h: "What does Megsy AI offer?", p: "The platform provides multiple AI tools in one place: smart conversations, professional image generation, video creation, and building full websites and apps with AI." },
    { h: "Why does this support matter?", p: "Megsy AI's support helps keep Orange developing and running its infrastructure, including mining, verification and payment systems on the TON network." },
    { h: "Note", p: "Sponsorship does not guarantee token value or earnings. Visit the Megsy AI website for current features, pricing and terms." },
  ];
  return <InfoPage title={x("supporter")} sections={sections}>
    <PrimaryButton onClick={() => openLink(SUPPORTER_URL)}>{x("openWebsite")}</PrimaryButton>
  </InfoPage>;
}
