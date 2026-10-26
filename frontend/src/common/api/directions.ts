import client from './request';
import type {RestResultResponse} from '@/common/model/response';
import {directionOptions} from '@/common/model/options';

export const loadDirectionOptions = async () => {
  const response = await client.get<RestResultResponse<{value: string; label: string; description: string}[]>>('/posting-directions');
  directionOptions.splice(0, directionOptions.length, ...response.data.result);
};
