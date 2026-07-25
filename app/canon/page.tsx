import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureCanonSnapshot, listCanonDecisions } from "@/app/canon-data";
import { listCanonPackages } from "@/app/canon-packages";
import { CanonReviewBoard } from "./canon-review-board";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "캐논 확인판 — Storyyard",
  description: "Foundry 캐노니컬 스냅샷을 사람이 읽고 판정하는 관리자 확인판",
  openGraph: {
    images: ["/canon-review-og.png"],
  },
};

export default async function CanonPage() {
  const user = await requireChatGPTUser("/canon");
  if (user.role !== "admin") redirect("/");
  const canonPackages = listCanonPackages();
  await Promise.all(canonPackages.map((canonPackage) => ensureCanonSnapshot(canonPackage)));
  const initialDecisionSets = Object.fromEntries(await Promise.all(canonPackages.map(async (canonPackage) => [
    canonPackage.workSlug,
    await listCanonDecisions(canonPackage.workSlug),
  ])));
  return (
    <CanonReviewBoard
      user={{ id: user.id, username: user.username, displayName: user.displayName, role: user.role }}
      canonPackages={canonPackages}
      initialDecisionSets={initialDecisionSets}
    />
  );
}
