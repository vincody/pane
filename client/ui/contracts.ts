import type {SessionRecord} from '../../shared/contracts.ts';
export type {Provider,Workspace,Limit,AccountQuota} from '../../shared/contracts.ts';
export type QuotaMode = 'auto' | '5h' | '7d' | 'both';
export type HistorySession=SessionRecord;
export interface TerminalAgent { id: string; project: string; agent: string; name: string; status: string; selected: boolean }
export type Api = <T>(route: string, options?: RequestInit) => Promise<T>;
export type NativeIcon = (name?: string) => SVGElement;
export function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
