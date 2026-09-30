import client from '@/common/api/request';
import type {Company, CompanySave} from '@/common/model/domain';
import type {RestPageResultResponse, RestResultResponse} from '@/common/model/response';

export const companyApi = {
  list: async (params: {keyword?: string; number?: number; size?: number} = {}) =>
    (await client.get<RestPageResultResponse<Company>>('/companies', {params})).data,
  save: async (data: CompanySave, id?: number) =>
    (id
      ? await client.put<RestResultResponse<Company>>(`/companies/${id}`, data)
      : await client.post<RestResultResponse<Company>>('/companies', data)).data.result,
};
