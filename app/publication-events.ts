"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const CHANNEL_NAME = "storyyard-publication";

export type PublicationUpdate = {
  projectId?: string;
  slug?: string;
  revision: string;
};

export function broadcastPublicationUpdate(update: PublicationUpdate) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(update);
  channel.close();
}

export function usePublicationRefresh() {
  const router = useRouter();
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => router.refresh();
    return () => channel.close();
  }, [router]);
}
