import client from '@/common/api/request';
import type {Posting, PostingSave} from '@/common/model/domain';
import type {RestPageResultResponse, RestResultResponse} from '@/common/model/response';

export const postingApi = {
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
