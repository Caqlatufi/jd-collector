export type PlatformCode = 'BOSS' | 'LIEPIN' | 'JOB51' | 'ZHAOPIN';
export type PageKind = 'LIST' | 'DETAIL' | 'LOGIN' | 'CHALLENGE' | 'OTHER';
export type LoginStatus = 'VERIFIED' | 'NEEDS_LOGIN' | 'NEEDS_VERIFICATION' | 'UNKNOWN';
export interface PlatformDefinition {
  platform: PlatformCode; name: string; homeUrl: string; domains: string[]; sessionKey: string; sourceQueryKeys?: string[];
}
export interface PostingCandidate {
  title: string; companyName?: string; sourceUrl?: string; rawJd?: string; location?: string;
  salaryText?: string; salaryRawText?: string; experienceText?: string; missingFields: string[];
}
export interface PlatformPageState {
  platform: PlatformCode; key: string; pageRevision: number; pageKind: PageKind;
  loginStatus: LoginStatus; checkedAt: string; readable: boolean; message: string;
}
export interface PageReadResult extends PlatformPageState {
  sourceUrl: string; readAt: string; structure?: Array<{selector: string; count: number}>; candidates: PostingCandidate[]; warnings: string[];
}
/** Trusted domain adapter registered by app; never supplied through IPC. */
export type PlatformAdapter = PlatformDefinition;
