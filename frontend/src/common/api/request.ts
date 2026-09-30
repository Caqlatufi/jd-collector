import type {RestResponse} from '@/common/model/response';
import axios, {AxiosError} from 'axios';

const client = axios.create({
  baseURL: '/jd-collector/api',
  timeout: 10_000,
});

client.interceptors.response.use(
  (response) => {
    const payload = response.data as Partial<RestResponse>;
    if (typeof payload.code === 'number' && payload.code !== 200) {
      return Promise.reject(new Error(payload.msg || '请求失败'));
    }
    return response;
  },
  (error: AxiosError<Partial<RestResponse>>) => {
    const message = error.response?.data?.msg || error.message || '请求失败';
    return Promise.reject(new Error(message));
  },
);

export default client;
