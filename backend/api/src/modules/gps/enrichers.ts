import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";

import type {
  MatchedVehicleRecord,
  NormalizedGpsMessage,
  OperationalStateUpsertInput,
  StoredOperationalStateRecord
} from "./types.js";

export interface GpsOperationalEnrichmentContext {
  baseState: OperationalStateUpsertInput;
  config: CmsConfig;
  logger: FastifyBaseLogger;
  normalized: NormalizedGpsMessage;
  previousState: StoredOperationalStateRecord | null;
  vehicle: MatchedVehicleRecord;
}

export interface GpsOperationalEnrichmentResult {
  extensions?: Partial<OperationalStateUpsertInput["extensions"]>;
  processingMetadata?: Record<string, unknown>;
}

export interface GpsOperationalEnricher {
  id: string;
  enrich(context: GpsOperationalEnrichmentContext): Promise<GpsOperationalEnrichmentResult | null>;
}

export function createDefaultGpsOperationalEnrichers(): GpsOperationalEnricher[] {
  return [];
}

export async function applyGpsOperationalEnrichers(
  enrichers: readonly GpsOperationalEnricher[],
  context: GpsOperationalEnrichmentContext
): Promise<{
  appliedEnrichers: string[];
  state: OperationalStateUpsertInput;
}> {
  let state = cloneState(context.baseState);
  const appliedEnrichers: string[] = [];

  for (const enricher of enrichers) {
    const result = await enricher.enrich({
      ...context,
      baseState: cloneState(state)
    });

    if (!result) {
      continue;
    }

    appliedEnrichers.push(enricher.id);
    state = {
      ...state,
      extensions: result.extensions
        ? {
            ...state.extensions,
            ...result.extensions
          }
        : state.extensions,
      processingMetadata: result.processingMetadata
        ? {
            ...state.processingMetadata,
            ...result.processingMetadata
          }
        : state.processingMetadata
    };
  }

  return {
    appliedEnrichers,
    state: {
      ...state,
      processingMetadata: {
        ...state.processingMetadata,
        appliedEnrichers
      }
    }
  };
}

function cloneState(state: OperationalStateUpsertInput): OperationalStateUpsertInput {
  return {
    ...state,
    extensions: {
      ...state.extensions
    },
    processingMetadata: {
      ...state.processingMetadata
    }
  };
}
