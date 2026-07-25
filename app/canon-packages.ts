import afterlifeRestaurant from "@/data/canon/afterlife_restaurant.json";
import knightsRestaurant from "@/data/canon/knights_restaurant.json";

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

export type StoryyardProjectionArc = {
  bId: string;
  routeOrder: number;
  status: string;
  targetAnchor: string;
  title: string;
  body: string;
  sourceSha256: string;
};

export type StoryyardProjectionEpisode = {
  episode: string;
  bId: string;
  title: string;
  body: string;
  status: "committed" | "provisional";
  authority: "owner_approved" | "owner_approved_story_plan_hypothesis";
  sourcePath: string;
  sourceSha256: string;
  sortOrder: number;
};

export type CanonPackage = {
  schemaVersion: "firefly_story_package_v1";
  workSlug: string;
  title: string;
  workflowSchema: string;
  sourcePath: string;
  sourceGitCommit: string;
  sourceState?: "committed" | "working_tree";
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
  storyyardProjection: {
    mappingVersion: "foundry_storyyard_arc_episode_v1";
    arcUnit: "b_rail_arc";
    blockUnit: "episode";
    reverseSync: false;
    arcs: StoryyardProjectionArc[];
    episodeBlocks: StoryyardProjectionEpisode[];
  };
  artifacts: CanonArtifact[];
};

const registry: Record<string, CanonPackage> = {
  afterlife_restaurant: afterlifeRestaurant as CanonPackage,
  knights_restaurant: knightsRestaurant as CanonPackage,
};

export function getCanonPackage(workSlug: string): CanonPackage | null {
  return registry[workSlug] ?? null;
}

export function listCanonPackages(): CanonPackage[] {
  return Object.values(registry);
}

export function getSyncableCanonPackage(workSlug: string): CanonPackage | null {
  const canonPackage = getCanonPackage(workSlug);
  return canonPackage?.sourceState === "working_tree" ? null : canonPackage;
}

export function listSyncableCanonPackages(): CanonPackage[] {
  return listCanonPackages().filter((canonPackage) => canonPackage.sourceState !== "working_tree");
}
