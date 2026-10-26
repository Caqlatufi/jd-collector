import client from '@/common/api/request';
import type {Company, CompanySave} from '@/common/model/domain';
import type {RestPageResultResponse, RestResultResponse} from '@/common/model/response';
import type {LocationPosition} from '@/company/map/locations';

export const companyApi = {
  positions: async () => (await client.get<RestResultResponse<LocationPosition[]>>('/companies/location-positions')).data.result,
  resolvePosition: async (address: string) => (await client.post<RestResultResponse<LocationPosition>>(
    '/companies/location-positions', {address}, {timeout: 15000},
  )).data.result,
  all: async (keyword = '') => {
    const rows: Company[] = [];
    let number = 1;
    let totalPages = 1;
    do {
      const response = (await client.get<RestPageResultResponse<Company>>('/companies', {
        params: {keyword, number, size: 100},
      })).data;
      rows.push(...response.result);
      totalPages = response.page?.totalPages ?? 1;
      number++;
    } while (number <= totalPages);
    return rows;
  },
  postingLocations: async () => (await client.get<RestResultResponse<{
    postingId: number; companyId: number; address: string;
  }[]>>('/postings/work-locations')).data.result,
  list: async (params: {keyword?: string; number?: number; size?: number} = {}) =>
    (await client.get<RestPageResultResponse<Company>>('/companies', {params})).data,
  save: async (data: CompanySave, id?: number) =>
    (id
      ? await client.put<RestResultResponse<Company>>(`/companies/${id}`, data)
      : await client.post<RestResultResponse<Company>>('/companies', data)).data.result,
};
