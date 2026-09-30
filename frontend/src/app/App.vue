<script setup lang="ts">
import {useAppStore} from '@/common/store/appStore';
import {
  Briefcase,
  Calendar,
  Collection,
  DataBoard,
  Files,
  OfficeBuilding,
  Key,
  Refresh,
} from '@element-plus/icons-vue';
import {ElMessage, ElMessageBox} from 'element-plus';
import {onMounted, ref} from 'vue';
import {useRoute} from 'vue-router';

const route = useRoute();
const appStore = useAppStore();
const refreshPending = ref(false);

async function refreshWorkbench() {
  if (refreshPending.value) return;
  refreshPending.value = true;
  try {
    await ElMessageBox.confirm(
      '只刷新 JD 工作台，保留当前路由；未保存的内容会丢失。其他招聘标签不受影响。请先保存，再继续。',
      '刷新工作台',
      {confirmButtonText: '确认刷新', cancelButtonText: '取消', type: 'warning'},
    );
    await appStore.refreshHealth();
    if (!appStore.backendAvailable) {
      ElMessage.error('本地服务暂不可用，已保留当前页面，请稍后重试。');
      return;
    }
    window.location.reload();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('刷新失败，请稍后重试。');
  } finally {
    refreshPending.value = false;
  }
}

onMounted(() => {
  appStore.refreshHealth();
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-primary">
        <div class="brand">
          <div class="brand-mark">JD</div>
          <div>
            <strong>JD Collector</strong>
            <span>求职冲刺工作台</span>
          </div>
        </div>

        <div class="header-actions">
          <div class="sprint-goal">
            <span>第一目标</span>
            <strong>10 月 11 日前确定 Offer</strong>
            <small>开发工具每天不超过 90 分钟</small>
          </div>
          <button class="health health-on-dark" type="button" @click="appStore.refreshHealth">
            <span :class="['health-dot', {online: appStore.backendAvailable}]" />
            {{ appStore.backendAvailable ? '后端已连接' : '后端未连接' }}
          </button>
        </div>
      </div>

      <el-menu :default-active="typeof route.meta.activeMenu === 'string' ? route.meta.activeMenu : route.path"
               router mode="horizontal" :ellipsis="false" class="navigation top-navigation">
        <el-menu-item index="/">
          <el-icon><DataBoard /></el-icon>
          <span>今日看板</span>
        </el-menu-item>
        <el-menu-item index="/postings">
          <el-icon><Collection /></el-icon>
          <span>JD 列表</span>
        </el-menu-item>
        <el-menu-item index="/pipeline">
          <el-icon><Briefcase /></el-icon>
          <span>投递 Pipeline</span>
        </el-menu-item>
        <el-menu-item index="/interviews">
          <el-icon><Calendar /></el-icon>
          <span>面试记录</span>
        </el-menu-item>
        <el-menu-item index="/resumes">
          <el-icon><Files /></el-icon>
          <span>简历版本</span>
        </el-menu-item>
        <el-menu-item index="/companies">
          <el-icon><OfficeBuilding /></el-icon>
          <span>公司库</span>
        </el-menu-item>
        <el-menu-item index="/accounts">
          <el-icon><Key /></el-icon>
          <span>平台账号</span>
        </el-menu-item>
      </el-menu>
    </header>

    <section class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">2026 年 9 月求职</span>
          <h1>{{ route.meta.title }}</h1>
        </div>
        <el-button class="refresh-workbench" :icon="Refresh" :disabled="refreshPending"
                   title="重新加载已部署的工作台页面，不关闭招聘标签" @click="refreshWorkbench">
          刷新工作台
        </el-button>
      </header>

      <main class="content">
        <router-view />
      </main>
    </section>
  </div>
</template>

<style scoped>
.refresh-workbench {
  flex-shrink: 0;
  margin-left: auto;
}
</style>
