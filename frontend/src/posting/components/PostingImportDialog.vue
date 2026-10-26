<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {desktop} from '@/common/desktop/client';
import {postingImportApi, type PostingImportTask} from '@/posting/api/postingImportApi';
import {showRequestError} from '@/common/utils/error';
import {normalizeJobUrl} from '@/common/desktop/jobUrl.mjs';

const props = defineProps<{modelValue: boolean}>();
const emit = defineEmits<{'update:modelValue': [value: boolean]; completed: []}>();
const visible = computed({get: () => props.modelValue, set: value => emit('update:modelValue', value)});
const sourceUrl = ref('');
const submitting = ref(false);
const tasks = ref<PostingImportTask[]>([]);
const error = ref('');
const listError = ref('');
const loading = ref(false);
const retrying = ref('');
const completed = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let disposed = false;
const labels: Record<PostingImportTask['status'], string> = {
  QUEUED: '等待收录', STARTING: '启动子 Agent', RUNNING: '收录中', SUCCEEDED: '已收录',
  WAITING_USER: '等待处理', NEEDS_REVIEW: '待核对', FAILED: '收录失败', PARTIAL: '已保存，部分待完成',
};
const canRetry = (task: PostingImportTask) => ['WAITING_USER', 'NEEDS_REVIEW', 'FAILED', 'PARTIAL'].includes(task.status);
const replaceTasks = (items: PostingImportTask[]) => {
  let changed = false;
  for (const task of items) {
    if (task.postingId && !completed.has(task.taskId)) {
      completed.add(task.taskId);
      changed = true;
    }
  }
  tasks.value = items;
  if (changed) emit('completed');
};
const refresh = async (initial = false) => {
  const token = generation;
  if (initial) loading.value = true;
  try {
    const result = await postingImportApi.list();
    if (disposed || token !== generation) return;
    replaceTasks(result);
    listError.value = '';
  } catch { if (!disposed && token === generation) listError.value = '收录任务加载失败，请重试刷新'; }
  finally {
    if (token === generation) {
      loading.value = false;
      if (!disposed && (props.modelValue || tasks.value.some(task => ['QUEUED', 'STARTING', 'RUNNING'].includes(task.status)))) {
        timer = setTimeout(() => { void refresh(); }, 2000);
      }
    }
  }
};
const submit = async () => {
  if (submitting.value) return;
  const value = sourceUrl.value.trim();
  try {
    normalizeJobUrl(value);
  } catch { error.value = '请填写完整的 HTTPS 岗位详情链接'; return; }
  submitting.value = true;
  error.value = '';
  try {
    const task = await postingImportApi.create(value);
    replaceTasks([task, ...tasks.value.filter(item => item.taskId !== task.taskId)]);
    sourceUrl.value = '';
  } catch (cause) { showRequestError(cause, '收录任务提交失败'); }
  finally { submitting.value = false; }
};
const retry = async (task: PostingImportTask) => {
  if (retrying.value) return;
  retrying.value = task.taskId;
  try {
    const updated = await postingImportApi.retry(task.taskId);
    tasks.value = tasks.value.map(item => item.taskId === updated.taskId ? updated : item);
  } catch (cause) { showRequestError(cause, '任务继续失败'); }
  finally { retrying.value = ''; }
};
const openTab = async (task: PostingImportTask) => {
  try { await desktop.request('browser.focus', {key: task.tabKey}); }
  catch (cause) { showRequestError(cause, '目标标签尚未打开或已关闭，请继续或重试任务'); }
};
watch(() => props.modelValue, value => {
  generation++;
  if (timer) clearTimeout(timer);
  if (value) { error.value = ''; void refresh(true); }
  else if (tasks.value.some(task => ['QUEUED', 'STARTING', 'RUNNING'].includes(task.status))) void refresh();
});
onMounted(() => { void refresh(); });
onBeforeUnmount(() => { disposed = true; generation++; if (timer) clearTimeout(timer); });
</script>

<template>
  <el-dialog v-model="visible" title="新增 JD" width="min(720px, 94vw)" :close-on-click-modal="false">
    <p class="import-help">粘贴招聘网站或企业官网的岗位链接，后台先核对是否为有效岗位详情，再读取完整 JD、评分并收录到已筛选阶段。</p>
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="JD 链接" required>
        <el-input v-model="sourceUrl" aria-label="新增 JD 链接" :maxlength="1000" :disabled="submitting"
          placeholder="粘贴招聘网站或企业官网的 HTTPS 岗位详情链接" @keydown.enter.prevent="submit" />
      </el-form-item>
      <el-button type="primary" :loading="submitting" @click="submit">开始收录</el-button>
    </el-form>
    <p class="import-help">收录在后台进行，你可以继续操作其他标签。需要登录或验证码时，点击“打开收录标签”处理，再返回工作台继续收录。关闭此弹窗后，任务仍会保留。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="listError" :title="listError" type="error" :closable="false" />
    <div v-loading="loading" class="import-tasks">
      <p v-if="!tasks.length && !loading" class="import-help">暂无收录任务</p>
      <article v-for="task in tasks" :key="task.taskId" class="import-task">
        <div class="task-heading">
          <strong>{{ task.title || 'JD 收录任务' }}</strong>
          <el-tag :type="task.status === 'SUCCEEDED' ? 'success' : canRetry(task) ? 'warning' : 'info'">{{ labels[task.status] }}</el-tag>
        </div>
        <p class="task-url">{{ task.sourceUrl }}</p>
        <p v-if="task.message" class="task-message" role="status">{{ task.message }}</p>
        <span v-if="task.errorCode" class="error-code">{{ task.errorCode }}</span>
        <div class="task-actions">
          <el-button v-if="['RUNNING', 'WAITING_USER', 'NEEDS_REVIEW'].includes(task.status)" link type="primary" @click="openTab(task)">打开收录标签</el-button>
          <el-button v-if="canRetry(task)" link type="primary" :loading="retrying === task.taskId" :disabled="!!retrying" @click="retry(task)">{{ task.status === 'WAITING_USER' ? '继续收录' : '重试' }}</el-button>
        </div>
      </article>
    </div>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>

<style scoped>
.import-help { color: var(--el-text-color-secondary); line-height: 1.7; }
.import-tasks { margin-top: 18px; max-height: 48vh; overflow-y: auto; }
.import-task { padding: 14px 0; border-top: 1px solid var(--el-border-color-lighter); }
.task-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.task-heading strong { overflow-wrap: anywhere; }
.task-url { font-size: 12px; color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
.task-message { margin: 8px 0; line-height: 1.6; }
.error-code { color: var(--el-color-danger); font-size: 12px; }
.task-actions { display: flex; gap: 12px; margin-top: 6px; }
</style>
