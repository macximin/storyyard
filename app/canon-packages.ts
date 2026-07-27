import afterlifeRestaurant from "@/data/canon/afterlife_restaurant.json";
import cheongmaRestaurant from "@/data/canon/cheongma_restaurant.json";
import isekaiRestaurant from "@/data/canon/isekai_restaurant.json";
import knightsRestaurant from "@/data/canon/knights_restaurant.json";
import romanceFantasyRestaurant from "@/data/canon/romance_fantasy_restaurant.json";
import tyrantRestaurant from "@/data/canon/tyrant_restaurant.json";

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

export type CanonConsistencyAudit = {
  schemaVersion: "storyyard_canon_consistency_audit_v1";
  sourceGitCommit: string;
  verdict: "pass" | "review";
  checks: Array<{
    axis: "overview" | "characters" | "plot" | "manuscript";
    label: string;
    verdict: "pass" | "review";
    summary: string;
    evidence: string[];
  }>;
  note: string;
};

export type StoryyardWorkspaceProjection = {
  mappingVersion: "foundry_storyyard_workspace_v1";
  reverseSync: false;
  overview: {
    title: string;
    logline: string;
    sourceSha256: string;
  };
  characters: Array<{
    entityKey: string;
    title: string;
    body: string;
    tags: string[];
    fields: Array<{ id: string; label: string; value: string }>;
    sortOrder: number;
    sourceSha256: string;
  }>;
  manuscripts: Array<{
    episodeNo: number;
    entityKey: string;
    title: string;
    body: string;
    status: "published";
    sourcePath: string;
    sourceSha256: string;
  }>;
  revisionSetSha256: string;
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
  ownership: {
    ownerId: string;
    scope: string;
    productionSystem: string;
  };
  revisionSetSha256: string;
  bundleSha256: string;
  scope: {
    includes: string[];
    excludes: string[];
  };
  status: {
    workflowSchema: string;
    title: string;
    ownerId: string;
    ownershipScope: string;
    productionSystem: string;
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
    mappingVersion: "foundry_storyyard_arc_episode_v1" | "foundry_storyyard_arc_episode_v2";
    arcUnit: "b_rail_arc";
    blockUnit: "episode";
    reverseSync: false;
    arcs: StoryyardProjectionArc[];
    episodeBlocks: StoryyardProjectionEpisode[];
  };
  workspaceProjection: StoryyardWorkspaceProjection;
  consistencyAudit: CanonConsistencyAudit;
  artifacts: CanonArtifact[];
};

const registry: Record<string, CanonPackage> = {
  afterlife_restaurant: afterlifeRestaurant as CanonPackage,
  cheongma_restaurant: cheongmaRestaurant as CanonPackage,
  isekai_restaurant: isekaiRestaurant as CanonPackage,
  knights_restaurant: knightsRestaurant as CanonPackage,
  romance_fantasy_restaurant: romanceFantasyRestaurant as CanonPackage,
  tyrant_restaurant: tyrantRestaurant as CanonPackage,
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
