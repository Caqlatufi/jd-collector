import client from '@/common/api/request';
import type {BossCompetitionStatus, Posting, PostingSave} from '@/common/model/domain';
import type {RestPageResultResponse, RestResultResponse} from '@/common/model/response';

export interface GreetingResult {
  postingId: number;
  resumeVersionId: number;
  resumeName: string;
  versionLabel: string;
  greeting: string;
  characterCount: number;
  evidence: {jdQuote: string; resumeQuote: string}[];
  model: string;
  reasoningEffort: string;
}

export interface CommuteSave {
  minMinutes: number;
  maxMinutes: number;
  note: string;
  expectedRiskNotes: string;
}

export interface BossCompetitionSave {
  expectedSourceUrl: string;
  status: BossCompetitionStatus;
  rank?: number;
  competitorCount?: number;
  surpassedPercent?: number;
  checkedAt: string;
  note?: string;
  evidencePath: string;
}

export const postingApi = {
  archive: async (id: number) =>
    (await client.put<RestResultResponse<boolean>>(`/postings/${id}/archive`)).data.result,
  saveBossCompetition: async (id: number, data: BossCompetitionSave) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/boss-competition`, data)).data.result,
  saveSourceUrl: async (id: number, sourceUrl: string, expectedSourceUrl: string) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/source-url`, {sourceUrl, expectedSourceUrl})).data.result,
  saveCommute: async (id: number, data: CommuteSave) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/commute`, data)).data.result,
  greeting: async (id: number, resumeVersionId: number) =>
    (await client.post<RestResultResponse<GreetingResult>>(`/postings/${id}/greeting`,
      {resumeVersionId}, {timeout: 155_000})).data.result,
  latestGreeting: async (id: number, resumeVersionId?: number) =>
    (await client.get<RestResultResponse<GreetingResult | null>>(`/postings/${id}/greeting`,
      {params: {resumeVersionId}})).data.result,
  findSource: async (url: string) => (await client.get<RestResultResponse<Posting[]>>('/postings/source', {params: {url}})).data.result,
  list: async (params: Record<string, unknown> = {}) =>
    (await client.get<RestPageResultResponse<Posting>>('/postings', {params})).data,
  get: async (id: number) =>
    (await client.get<RestResultResponse<Posting>>(`/postings/${id}`)).data.result,
  save: async (data: PostingSave, id?: number) =>
    (id
      ? await client.put<RestResultResponse<Posting>>(`/postings/${id}`, data)
      : await client.post<RestResultResponse<Posting>>('/postings', data)).data.result,
  exportCsv: async (params: Record<string, unknown> = {}) => {
    const response = await client.get<Blob>('/postings/export.csv', {params, responseType: 'blob'});
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `jd-collector-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
