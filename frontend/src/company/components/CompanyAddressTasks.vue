<script setup lang="ts">
import {companyAddressApi, type AddressTask} from '@/company/api/companyAddressApi';
import type {Company} from '@/common/model/domain';
import {desktop} from '@/common/desktop/client';
import {onBeforeUnmount, onMounted, ref} from 'vue';

const visible = defineModel<boolean>({default: false});
const emit = defineEmits<{completed: []}>();
const tasks = ref<AddressTask[]>([]);
const error = ref('');
const busy = ref(false);
const completed = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const labels: Record<string, string> = {QUEUED: '等待查询', STARTING: '正在启动', RUNNING: '正在查找', SUCCEEDED: '地址已保存',
  FAILED: '查询失败', WAITING_USER: '等待处理', NEEDS_REVIEW: '需要核实'};
const refresh = async () => {
  try {
    const rows = await companyAddressApi.list();
    if (disposed) return;
    const changed = rows.some(row => row.status === 'SUCCEEDED' && !completed.has(row.taskId));
    rows.filter(row => row.status === 'SUCCEEDED').forEach(row => completed.add(row.taskId));
    tasks.value = rows;
    if (changed) emit('completed');
    error.value = '';
  } catch (failure) { if (!disposed) error.value = failure instanceof Error ? failure.message : '地址任务加载失败'; }
};
const poll = async () => { await refresh(); if (!disposed) timer = setTimeout(poll, 2500); };
const start = async (company: Company) => {
  if (busy.value) return;
  visible.value = true;
  busy.value = true;
  try { await companyAddressApi.create(company.id); await refresh(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '地址任务创建失败'; }
  finally { busy.value = false; }
};
const retry = async (task: AddressTask) => {
  if (busy.value) return;
  busy.value = true;
  try { await companyAddressApi.retry(task.taskId); await refresh(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '重试失败'; }
  finally { busy.value = false; }
};
const openTask = async (task: AddressTask) => {
  try { await desktop.request('browser.focus', {key: task.tabKey}); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '查询标签打开失败'; }
};
defineExpose({start});
onMounted(poll);
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); });
</script>

<template>
  <el-dialog v-model="visible" title="公司地址查询" width="720px" class="address-task-dialog" destroy-on-close>
    <p class="task-note">优先从 JD 链接查找工作地址；官网岗位页没有详细地址时，查询公司的上海办公地址并保留来源。任务在后台进行，关闭弹窗后继续。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="refresh">重新加载</el-button></el-alert>
    <el-empty v-if="!tasks.length && !error" description="在工作地点清单点击“补全地址”开始查询" :image-size="70" />
    <article v-for="task in tasks" :key="task.taskId" class="address-task" :data-company-id="task.companyId">
      <div class="task-heading"><strong>{{ task.companyName }}</strong><el-tag :type="task.status === 'SUCCEEDED' ? 'success' : 'info'">{{ labels[task.status] }}</el-tag></div>
      <p v-if="task.message">{{ task.message }}</p>
      <p v-if="task.address">{{ task.address }}</p>
      <p v-if="task.errorCode" class="task-code">{{ task.errorCode }}</p>
      <div class="task-actions">
        <el-button v-if="['FAILED', 'WAITING_USER', 'NEEDS_REVIEW'].includes(task.status)" link type="primary" :disabled="busy" @click="retry(task)">{{ task.status === 'WAITING_USER' ? '继续查询' : '重试' }}</el-button>
        <el-button v-if="task.status === 'WAITING_USER'" link type="primary" @click="openTask(task)">打开查询标签</el-button>
      </div>
    </article>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>

<style scoped>
.task-note { line-height: 1.8; color: #7b827b; }
.address-task { padding: 16px 0; border-bottom: 1px solid #e7ebe5; }
.task-heading, .task-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.address-task p { overflow-wrap: anywhere; line-height: 1.7; margin: 8px 0; }
.task-code { color: #b44b3b; font-size: 12px; }
.task-actions { justify-content: flex-start; }
</style>
