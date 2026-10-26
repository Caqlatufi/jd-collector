import client from '@/common/api/request';
import type {RestResultResponse} from '@/common/model/response';

export interface AddressTask {
  taskId: string;
  companyId: number;
  companyName: string;
  tabKey: string;
  status: 'QUEUED' | 'STARTING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'WAITING_USER' | 'NEEDS_REVIEW';
  message?: string;
  phase?: string;
  errorCode?: string;
  address?: string;
  sourceType?: string;
}
export interface AddressDiscovery {
  id: number;
  companyId: number;
  postingId?: number;
  address: string;
  sourceType: 'JD' | 'COMPANY';
  sourceUrl: string;
  evidenceText: string;
}
export const companyAddressApi = {
  list: async () => (await client.get<RestResultResponse<AddressTask[]>>('/company-address-tasks')).data.result,
  create: async (companyId: number) => (await client.post<RestResultResponse<AddressTask>>('/company-address-tasks', {companyId})).data.result,
  retry: async (taskId: string) => (await client.post<RestResultResponse<AddressTask>>(`/company-address-tasks/${taskId}/retry`)).data.result,
  discoveries: async () => (await client.get<RestResultResponse<AddressDiscovery[]>>('/companies/address-discoveries')).data.result,
};
