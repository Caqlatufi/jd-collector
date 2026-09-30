import client from '@/common/api/request';
import type {RestResultResponse} from '@/common/model/response';
import type {CriteriaAnswer, CriteriaResponse} from '../model';

export const criteriaApi = {
  get: async () => (await client.get<RestResultResponse<CriteriaResponse>>('/criteria')).data.result,
  save: async (revision: string, answers: CriteriaAnswer[]) =>
    (await client.put<RestResultResponse<CriteriaResponse>>('/criteria', {revision, answers})).data.result,
};
