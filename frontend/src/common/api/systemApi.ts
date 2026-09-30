import client from '@/common/api/request';
import type {RestResultResponse} from '@/common/model/response';

export interface SystemHealth {
  service: string;
  status: string;
  framework: string;
  timestamp: string;
}
export async function getSystemHealth(): Promise<SystemHealth> {
  const {data} = await client.get<RestResultResponse<SystemHealth>>('/system/health');
  return data.result;
}
