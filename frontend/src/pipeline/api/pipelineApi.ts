import client from '@/common/api/request';
import type {Posting, StageChange, StageEvent} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export const pipelineApi = {
  changeStage: async (id: number, data: StageChange) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/stage`, data)).data.result,
  events: async (id: number) =>
    (await client.get<RestResultResponse<StageEvent[]>>(`/postings/${id}/events`)).data.result,
};
