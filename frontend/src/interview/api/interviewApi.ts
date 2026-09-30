import client from '@/common/api/request';
import type {Interview, InterviewSave} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export const interviewApi = {
  list: async (params: Record<string, unknown> = {}) =>
    (await client.get<RestResultResponse<Interview[]>>('/interviews', {params})).data.result,
  save: async (postingId: number, data: InterviewSave, id?: number) =>
    (id
      ? await client.put<RestResultResponse<Interview>>(`/interviews/${id}`, data)
      : await client.post<RestResultResponse<Interview>>(`/postings/${postingId}/interviews`, data)).data.result,
};
