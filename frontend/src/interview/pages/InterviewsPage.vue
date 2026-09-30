<script setup lang="ts">
import {interviewApi} from '@/interview/api/interviewApi';
import {postingApi} from '@/posting/api/postingApi';
import type {Interview, InterviewSave, InterviewStatus, Posting} from '@/common/model/domain';
import {interviewFormatOptions, interviewStatusOptions, interviewTypeOptions, labelOf, stageOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import dayjs from 'dayjs';
import {ElMessage} from 'element-plus';
import {computed, onMounted, reactive, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();

const rows = ref<Interview[]>([]);
const postings = ref<Posting[]>([]);
const statusFilter = ref<InterviewStatus>();
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number>();
const postingId = ref<number>();
const routePostingId = ref<number>();
const visibleRows = computed(() => routePostingId.value ? rows.value.filter(row => row.jobPostingId === routePostingId.value) : rows.value);
const interviewStages = ['APPLIED', 'HR_SCREEN', 'WRITTEN_TEST', 'INTERVIEW', 'OFFER'] as const;

const emptyForm = (): InterviewSave => ({
  roundNo: 1, type: 'TECHNICAL', format: 'ONLINE',
  scheduledAt: dayjs().add(1, 'day').hour(10).minute(0).second(0).format('YYYY-MM-DDTHH:mm:ss'),
  status: 'SCHEDULED', interviewer: '', questions: '', feedback: '', nextStep: '',
});
const form = reactive<InterviewSave>(emptyForm());

const load = async () => {
  loading.value = true;
  try {
    const [interviews, postingPage] = await Promise.all([
      interviewApi.list({status: statusFilter.value || undefined}),
      postingApi.list({size: 100}),
    ]);
    rows.value = interviews;
    postings.value = postingPage.result.filter(item => item.tier !== 'SKIP' && interviewStages.includes(item.stage as typeof interviewStages[number]));
  } catch (error) { showRequestError(error, '面试记录加载失败'); }
  finally { loading.value = false; }
};

const openCreate = () => { editingId.value = undefined; postingId.value = undefined; Object.assign(form, emptyForm()); dialogVisible.value = true; };
const openEdit = (row: Interview) => {
  editingId.value = row.id; postingId.value = row.jobPostingId;
  Object.assign(form, {
    roundNo: row.roundNo, type: row.type, format: row.format, scheduledAt: row.scheduledAt,
    status: row.status, interviewer: row.interviewer ?? '', questions: row.questions ?? '',
    feedback: row.feedback ?? '', nextStep: row.nextStep ?? '',
  });
  dialogVisible.value = true;
};
const save = async () => {
  if (!postingId.value || !form.scheduledAt) { ElMessage.warning('请选择岗位并填写面试时间'); return; }
  try {
    await interviewApi.save(postingId.value, {...form}, editingId.value);
    ElMessage.success(editingId.value ? '面试记录已更新' : '面试日程已创建'); dialogVisible.value = false; await load();
  } catch (error) { showRequestError(error); }
};

const clearPostingFilter = async () => {
  routePostingId.value = undefined;
  await router.replace('/interviews');
};

onMounted(async () => {
  const id = Number(route.query.postingId);
  if (Number.isInteger(id) && id > 0) routePostingId.value = id;
  await load();
});
</script>

<template>
  <section class="page-stack">
    <div class="page-toolbar">
      <div class="toolbar-search"><el-select v-model="statusFilter" clearable placeholder="面试状态" @change="load"><el-option v-for="item in interviewStatusOptions" :key="item.value" v-bind="item" /></el-select><span class="toolbar-note">每场面试当天完成复盘</span></div>
      <el-button type="primary" :disabled="postings.length === 0" @click="openCreate">安排面试</el-button>
    </div>
    <el-alert v-if="routePostingId" title="当前只显示从看板打开的岗位面试" type="info" show-icon closable @close="clearPostingFilter" />
    <div class="table-panel">
      <el-table v-loading="loading" :data="visibleRows" stripe empty-text="暂无面试日程">
        <el-table-column label="时间" width="160"><template #default="{row}"><strong>{{ row.scheduledAt.replace('T', ' ').slice(0, 16) }}</strong></template></el-table-column>
        <el-table-column label="公司 / 岗位" min-width="230"><template #default="{row}"><strong>{{ row.jobTitle }}</strong><div class="cell-subtitle">{{ row.companyName }}</div></template></el-table-column>
        <el-table-column label="轮次" width="120"><template #default="{row}">第 {{ row.roundNo }} 轮 · {{ labelOf(interviewTypeOptions, row.type) }}</template></el-table-column>
        <el-table-column label="形式" width="90"><template #default="{row}">{{ labelOf(interviewFormatOptions, row.format) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status === 'COMPLETED' ? 'success' : row.status === 'SCHEDULED' ? 'warning' : 'info'">{{ labelOf(interviewStatusOptions, row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="nextStep" label="复盘 / 下一步" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="90" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openEdit(row)">{{ row.status === 'SCHEDULED' ? '记录/调整' : '查看复盘' }}</el-button></template></el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '面试记录与复盘' : '安排面试'" width="820px" top="6vh">
      <el-form label-position="top" class="form-grid three-columns">
        <el-form-item label="岗位" class="two-span" required><el-select v-model="postingId" filterable :disabled="!!editingId"><el-option v-for="item in postings" :key="item.id" :label="`${item.companyName} · ${item.title} · ${labelOf(stageOptions, item.stage)}`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="轮次" required><el-input-number v-model="form.roundNo" :min="1" /></el-form-item>
        <el-form-item label="面试类型" required><el-select v-model="form.type"><el-option v-for="item in interviewTypeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="面试形式" required><el-select v-model="form.format"><el-option v-for="item in interviewFormatOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="面试状态" required><el-select v-model="form.status"><el-option v-for="item in interviewStatusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="面试时间" class="two-span" required><el-date-picker v-model="form.scheduledAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="面试官 / 角色"><el-input v-model="form.interviewer" /></el-form-item>
        <el-form-item label="面试问题" class="full-span"><el-input v-model="form.questions" type="textarea" :rows="5" placeholder="逐条记录问题和追问" /></el-form-item>
        <el-form-item label="表现与反馈" class="full-span"><el-input v-model="form.feedback" type="textarea" :rows="5" placeholder="自评、招聘方反馈、暴露的问题" /></el-form-item>
        <el-form-item label="下一步 / 改进项" class="full-span"><el-input v-model="form.nextStep" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>
