import client from '@/common/api/request';
import type {Interview, InterviewSave, Stage} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export const interviewApi = {
  schedule: async (postingId: number, data: {
    expectedStage: Stage; scheduledAt: string; type: InterviewSave['type']; format: InterviewSave['format']; note?: string;
  }) => (await client.post<RestResultResponse<Interview>>(`/postings/${postingId}/interview-schedule`, data)).data.result,
  list: async (params: Record<string, unknown> = {}) =>
    (await client.get<RestResultResponse<Interview[]>>('/interviews', {params})).data.result,
  save: async (postingId: number, data: InterviewSave, id?: number) =>
    (id
      ? await client.put<RestResultResponse<Interview>>(`/interviews/${id}`, data)
      : await client.post<RestResultResponse<Interview>>(`/postings/${postingId}/interviews`, data)).data.result,
};
