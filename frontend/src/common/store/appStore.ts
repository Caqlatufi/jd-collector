import {getSystemHealth, type SystemHealth} from '@/common/api/systemApi';
import {defineStore} from 'pinia';
import {computed, ref} from 'vue';

export const useAppStore = defineStore('app', () => {
  const health = ref<SystemHealth>();
  const healthError = ref('');
  const healthLoading = ref(false);

  const backendAvailable = computed(() => health.value?.status === 'UP');

  async function refreshHealth(): Promise<void> {
    healthLoading.value = true;
    healthError.value = '';
    try {
      health.value = await getSystemHealth();
    } catch (error) {
      health.value = undefined;
      healthError.value = error instanceof Error ? error.message : '后端暂未连接';
    } finally {
      healthLoading.value = false;
    }
  }

  return {
    health,
    healthError,
    healthLoading,
    backendAvailable,
    refreshHealth,
  };
});
