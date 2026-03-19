import { loadCmsConfig, type CmsConfig, type LoadedCmsConfig } from "@cmsfleet/config-runtime";

export type ApiConfig = CmsConfig;
export type LoadedApiConfig = LoadedCmsConfig;

export function loadApiConfig(rawEnv: NodeJS.ProcessEnv = process.env): LoadedApiConfig {
  return loadCmsConfig({ rawEnv });
}