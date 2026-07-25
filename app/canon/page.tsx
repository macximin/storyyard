import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureCanonSnapshot, listCanonDecisions } from "@/app/canon-data";
import { getCanonPackage } from "@/app/canon-packages";
import { CanonReviewBoard } from "./canon-review-board";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "저승식당 캐논 확인판 — Storyyard",
  description: "Foundry 캐노니컬 스냅샷을 사람이 읽고 판정하는 관리자 확인판",
  openGraph: {
    images: ["/canon-review-og.png"],
  },
};

export default async function CanonPage() {
  const user = await requireChatGPTUser("/canon");
  if (user.role !== "admin") redirect("/");
  const canonPackage = getCanonPackage("afterlife_restaurant");
  if (!canonPackage) throw new Error("afterlife_restaurant canon package is unavailable");
  await ensureCanonSnapshot(canonPackage);
  const initialDecisions = await listCanonDecisions(canonPackage.workSlug);
  return (
    <CanonReviewBoard
      user={{ id: user.id, username: user.username, displayName: user.displayName, role: user.role }}
      canonPackage={canonPackage}
      initialDecisions={initialDecisions}
    />
  );
}
