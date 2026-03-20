import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";

import type { NextStopCandidate, ResolutionVehicleContext, RouteState } from "./types.js";

export interface RouteAutoMatchContext {
  config: CmsConfig;
  evaluatedAt: string;
  logger: FastifyBaseLogger;
  referenceTime: string;
  timeZone: string;
  vehicle: ResolutionVehicleContext;
}

export interface RouteAutoMatchResult {
  directionId: number | null;
  metadata?: Record<string, unknown>;
  nextStop?: NextStopCandidate | null;
  route: {
    id: string;
    routeLongName: string | null;
    routeShortName: string;
  };
  routeState: RouteState;
  serviceDate: string | null;
  trip?: {
    headsign: string | null;
    id: string;
    shortName: string | null;
    startOffsetSeconds: number;
    state: "active" | "completed" | "upcoming";
    tripEndOffsetSeconds: number;
    variantHeadsign: string | null;
    variantId: string | null;
  } | null;
}

export interface RouteAutoMatcher {
  id: string;
  match(context: RouteAutoMatchContext): Promise<RouteAutoMatchResult | null>;
}

export function createDefaultRouteAutoMatchers(): RouteAutoMatcher[] {
  return [];
}

export async function resolveRouteAutoMatch(
  matchers: readonly RouteAutoMatcher[],
  context: RouteAutoMatchContext
): Promise<{ match: RouteAutoMatchResult; matcherId: string } | null> {
  for (const matcher of matchers) {
    const match = await matcher.match(context);

    if (match) {
      return {
        match,
        matcherId: matcher.id
      };
    }
  }

  return null;
}
