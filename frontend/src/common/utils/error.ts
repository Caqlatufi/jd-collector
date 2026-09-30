import {ElMessage} from 'element-plus';

export const showRequestError = (error: unknown, fallback = '操作失败'): void => {
  ElMessage.error(error instanceof Error && error.message ? error.message : fallback);
};
