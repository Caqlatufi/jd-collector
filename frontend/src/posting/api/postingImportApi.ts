import client from '@/common/api/request';
import type {RestResultResponse} from '@/common/model/response';

export interface PostingImportTask {
  taskId: string;
  sourceUrl: string;
  tabKey: string;
  status: 'QUEUED' | 'STARTING' | 'RUNNING' | 'SUCCEEDED' | 'WAITING_USER' | 'NEEDS_REVIEW' | 'FAILED' | 'PARTIAL';
  phase?: string;
  message?: string;
  errorCode?: string;
  postingId?: number;
  title?: string;
  duplicate?: boolean;
  createdAt: string;
  attempt: number;
}

export const postingImportApi = {
  list: async () => (await client.get<RestResultResponse<PostingImportTask[]>>('/posting-imports')).data.result,
  create: async (sourceUrl: string) =>
    (await client.post<RestResultResponse<PostingImportTask>>('/posting-imports', {sourceUrl})).data.result,
  retry: async (id: string) =>
    (await client.post<RestResultResponse<PostingImportTask>>(`/posting-imports/${id}/retry`)).data.result,
};
