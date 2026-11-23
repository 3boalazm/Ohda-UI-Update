export type HeaderRule = { path: string; headers: Record<string, string> };
export type VercelRoute = {
  src?: string;
  dest?: string;
  handle?: string;
  headers?: Record<string, string>;
  continue?: boolean;
};
export type VercelConfig = { routes?: VercelRoute[]; [key: string]: unknown };

export function parseHeadersFile(text: string): HeaderRule[];
export function pathToSrc(path: string): string;
export function applyRules(config: VercelConfig, rules: HeaderRule[]): VercelConfig;
