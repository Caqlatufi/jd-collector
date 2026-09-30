import client from '@/common/api/request';
import type {DashboardData} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export const dashboardApi = {
  today: async () => (await client.get<RestResultResponse<DashboardData>>('/dashboard/today')).data.result,
};
