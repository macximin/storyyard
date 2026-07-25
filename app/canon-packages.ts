import afterlifeRestaurant from "@/data/canon/afterlife_restaurant.json";

export type CanonDecisionValue = "approve" | "conditional" | "revise" | "reject";
export type CanonDecisionStatus = "pending" | "applied" | "stale" | "rejected";

export type CanonArtifact = {
  key: string;
  label: string;
  kind: "status" | "pitch" | "story_plan" | "manuscript" | "review" | "state";
  authority: string;
  sourcePath: string;
  sha256: string;
  body: string;
};

export type CanonPackage = {
  schemaVersion: "firefly_story_package_v1";
  workSlug: string;
  title: string;
  workflowSchema: string;
  sourcePath: string;
  sourceGitCommit: string;
  sourceUpdatedAt: string;
  revisionSetSha256: string;
  bundleSha256: string;
  scope: {
    includes: string[];
    excludes: string[];
  };
  status: {
    workflowSchema: string;
    title: string;
    productionStage: string;
    currentEpisode: string;
    currentBArc: string;
    manuscriptThrough: string;
    approvedThrough: string;
    reviewedThrough: string;
    stateThrough: string;
    nextAction: string;
    updatedAt: string;
  };
  anchors: Array<{
    id: string;
    label: string;
    status: string;
    trigger: string;
    irreversibleExchange: string;
    nextPressure: string;
  }>;
  bArcs: Array<{
    id: string;
    order: number;
    status: string;
    targetAnchor: string;
    narrativeFunction: string;
    payoffAxis: string;
    readerDebt: string;
    contrast: string;
    startEpisode: string;
    endEpisode: string;
  }>;
  artifacts: CanonArtifact[];
};

const registry: Record<string, CanonPackage> = {
  afterlife_restaurant: afterlifeRestaurant as CanonPackage,
};

export function getCanonPackage(workSlug: string): CanonPackage | null {
  return registry[workSlug] ?? null;
}

export function listCanonPackages(): CanonPackage[] {
  return Object.values(registry);
}
