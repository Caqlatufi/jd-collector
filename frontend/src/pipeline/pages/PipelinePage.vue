<script setup lang="ts">
import {loadDirectionOptions} from '@/common/api/directions';
import TierBadge from '@/common/components/TierBadge.vue';
import {pipelineApi} from '@/pipeline/api/pipelineApi';
import {postingApi} from '@/posting/api/postingApi';
import {interviewApi} from '@/interview/api/interviewApi';
import type {Direction, InterviewSave, Posting, Stage, StageEvent, Tier} from '@/common/model/domain';
import {directionOptions, interviewFormatOptions, interviewTypeOptions, labelOf, stageOptions, tierOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import {ElMessage} from 'element-plus';
import {computed, onMounted, reactive, ref, watch} from 'vue';
import {useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();

const rows = ref<Posting[]>([]);
const loading = ref(false);
const saving = ref(false);
const showInterviewDetails = ref(false);
let loadSequence = 0;
const keyword = ref('');
const stageFilter = ref<Stage>();
const directionFilter = ref<Direction>();
const tierFilter = ref<Tier>();
const dialogVisible = ref(false);
const historyVisible = ref(false);
const selected = ref<Posting>();
const events = ref<StageEvent[]>([]);

type Outcome = 'INTERVIEW' | 'REJECTED' | 'OFFER' | 'ACCEPTED' | 'WITHDRAWN';
const form = reactive({result: 'INTERVIEW' as Outcome, scheduledAt: '',
  type: 'TECHNICAL' as InterviewSave['type'], format: 'ONLINE' as InterviewSave['format'], note: ''});
const terminalStages: Stage[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
const appliedStages: Stage[] = ['APPLIED', 'HR_SCREEN', 'WRITTEN_TEST', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
const pipelineStageOptions = stageOptions.filter(item => appliedStages.includes(item.value));
const resultOptions = computed(() => selected.value?.stage === 'OFFER'
  ? [{value: 'ACCEPTED', label: '接受 Offer'}, {value: 'WITHDRAWN', label: '放弃 Offer'}]
  : selected.value?.stage === 'INTERVIEW'
    ? [{value: 'INTERVIEW', label: '安排下一轮面试'}, {value: 'OFFER', label: '收到 Offer'}, {value: 'REJECTED', label: '面试未通过'}]
    : [{value: 'INTERVIEW', label: '安排面试'}, {value: 'REJECTED', label: '初筛不通过'}]);
const focusedPostingId = computed(() => Number(route.query.postingId) || undefined);
const isPipelinePosting = (row: Posting) => Boolean(row.appliedAt) || appliedStages.includes(row.stage);
const nameMatches = computed(() => {
  const term = keyword.value.trim().toLocaleLowerCase();
  return rows.value.filter(row => !term || [row.companyName, row.title].some(name => name.toLocaleLowerCase().includes(term)));
});
const visibleRows = computed(() => nameMatches.value.filter(row =>
  (!stageFilter.value || row.stage === stageFilter.value) &&
  (!focusedPostingId.value || row.id === focusedPostingId.value)));
const emptyText = computed(() => keyword.value.trim() || stageFilter.value || directionFilter.value || tierFilter.value || focusedPostingId.value
  ? '没有匹配的投递记录，请调整搜索或筛选条件'
  : '还没有已投递岗位，请先从 JD 列表点击“投递”');

watch(() => route.query, query => {
  keyword.value = typeof query.keyword === 'string' ? query.keyword : '';
  stageFilter.value = typeof query.stage === 'string' && pipelineStageOptions.some(item => item.value === query.stage)
    ? query.stage as Stage : undefined;
}, {immediate: true});

const load = async () => {
  const sequence = ++loadSequence;
  const params = {direction: directionFilter.value || undefined, tier: tierFilter.value || undefined, size: 100};
  loading.value = true;
  try {
    await loadDirectionOptions();
    const postings = await postingApi.list(params);
    const allPostings = [...postings.result];
    for (let number = 2; number <= (postings.page?.totalPages ?? 1); number++) {
      if (sequence !== loadSequence) return;
      const nextPage = await postingApi.list({...params, number});
      allPostings.push(...nextPage.result);
    }
    const pipelineRows = allPostings.filter(isPipelinePosting);
    if (sequence !== loadSequence) return;
    if (focusedPostingId.value && !params.direction && !params.tier && !pipelineRows.some(row => row.id === focusedPostingId.value)) {
      const focused = await postingApi.get(focusedPostingId.value);
      if (isPipelinePosting(focused)) pipelineRows.push(focused);
    }
    if (sequence !== loadSequence) return;
    rows.value = pipelineRows;
  } catch (error) { if (sequence === loadSequence) showRequestError(error, '投递流程加载失败'); }
  finally { if (sequence === loadSequence) loading.value = false; }
};

const openAdvance = (row: Posting) => {
  selected.value = row;
  Object.assign(form, {
    result: row.stage === 'OFFER' ? 'ACCEPTED' : 'INTERVIEW',
    scheduledAt: '', type: 'TECHNICAL', format: 'ONLINE', note: '',
  });
  showInterviewDetails.value = false;
  dialogVisible.value = true;
};

const saveResult = async () => {
  if (!selected.value || saving.value) return;
  if (form.result === 'INTERVIEW' && !form.scheduledAt) { ElMessage.warning('请填写面试时间'); return; }
  saving.value = true;
  try {
    if (form.result === 'INTERVIEW') {
      await interviewApi.schedule(selected.value.id, {expectedStage: selected.value.stage, scheduledAt: form.scheduledAt,
        type: form.type, format: form.format, note: form.note});
    } else {
      await pipelineApi.recordResult(selected.value.id, {expectedStage: selected.value.stage, result: form.result, note: form.note});
    }
    ElMessage.success(form.result === 'INTERVIEW' ? '面试已安排，已同步到时间图' : '反馈结果已记录');
    dialogVisible.value = false; await load();
  } catch (error) { showRequestError(error, '反馈保存失败'); }
  finally { saving.value = false; }
};

const showHistory = async (row: Posting) => {
  selected.value = row;
  try { events.value = await pipelineApi.events(row.id); historyVisible.value = true; }
  catch (error) { showRequestError(error, '阶段历史加载失败'); }
};

const applyFilters = async () => {
  await router.replace({path: '/pipeline', query: {
    ...route.query, stage: stageFilter.value || undefined, postingId: undefined,
  }});
};

const searchNames = () => router.replace({path: '/pipeline', query: {
  ...route.query, keyword: keyword.value || undefined, postingId: undefined,
}});
const showAll = async () => {
  directionFilter.value = undefined;
  tierFilter.value = undefined;
  await router.replace({path: '/pipeline'});
  await load();
};

onMounted(load);
</script>

<template>
  <section class="page-stack">
    <el-alert v-if="focusedPostingId" title="正在查看所选投递岗位" type="info" :closable="false"><el-button link @click="showAll">查看全部岗位</el-button></el-alert>
    <div class="page-toolbar">
      <div class="toolbar-search wide-search">
        <el-input v-model="keyword" clearable placeholder="搜索公司或岗位名称" aria-label="搜索公司或岗位名称" @input="searchNames" />
        <el-select v-model="stageFilter" clearable placeholder="筛选当前阶段" @change="applyFilters"><el-option v-for="item in pipelineStageOptions" :key="item.value" v-bind="item" /></el-select>
        <el-select v-model="directionFilter" clearable placeholder="筛选方向" @change="load"><el-option v-for="item in directionOptions" :key="item.value" v-bind="item" /></el-select>
        <el-select v-model="tierFilter" clearable placeholder="筛选等级" @change="load"><el-option v-for="item in tierOptions" :key="item.value" v-bind="item"><TierBadge :tier="item.value" /></el-option></el-select>
        <span class="toolbar-note">收到反馈后安排面试或记录不通过；等待中的投递自动跟踪</span>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>
    <div class="pipeline-summary">
      <button v-for="item in pipelineStageOptions" :key="item.value" type="button" :class="{active: stageFilter === item.value}" @click="stageFilter = item.value; applyFilters()">
        <span>{{ item.label }}</span><strong>{{ nameMatches.filter(row => row.stage === item.value).length }}</strong>
      </button>
    </div>
    <div class="table-panel">
      <el-table v-loading="loading" :data="visibleRows" stripe :empty-text="emptyText">
        <el-table-column label="公司 / 岗位" min-width="250"><template #default="{row}"><strong>{{ row.title }}</strong><div class="cell-subtitle">{{ row.companyName }} · {{ labelOf(directionOptions, row.direction) }}</div></template></el-table-column>
        <el-table-column label="等级" width="85"><template #default="{row}"><TierBadge :tier="row.tier" /></template></el-table-column>
        <el-table-column label="阶段" width="120"><template #default="{row}">{{ labelOf(stageOptions, row.stage) }}</template></el-table-column>
        <el-table-column label="投递简历" width="180"><template #default="{row}"><el-button v-if="row.resumeVersionId" link type="primary" @click="router.push(`/resumes/${row.resumeVersionId}/view`)">{{ row.resumeVersionName || '查看简历' }}</el-button><span v-else>-</span></template></el-table-column>
        <el-table-column label="后续安排" min-width="220"><template #default="{row}"><strong>{{ row.nextAction || (terminalStages.includes(row.stage) ? '已结束' : row.stage === 'OFFER' ? '待确认 Offer' : '等待反馈') }}</strong><div class="cell-subtitle">{{ row.nextActionAt?.replace('T', ' ').slice(0, 16) || '' }}</div></template></el-table-column>
        <el-table-column label="操作" width="215" fixed="right"><template #default="{row}"><el-button v-if="!terminalStages.includes(row.stage)" link type="primary" :disabled="saving" @click="openAdvance(row)">记录反馈</el-button><el-button link @click="router.push({path:'/',query:{postingId:row.id}})">时间表</el-button><el-button link @click="showHistory(row)">历史</el-button></template></el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="`记录反馈：${selected?.companyName || ''} · ${selected?.title || ''}`" width="600px" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <el-form label-position="top" class="form-grid two-columns">
        <el-form-item label="反馈结果" required class="full-span"><el-radio-group v-model="form.result" :disabled="saving"><el-radio-button v-for="item in resultOptions" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button></el-radio-group></el-form-item>
        <template v-if="form.result === 'INTERVIEW'">
          <el-form-item label="面试时间" required class="full-span"><el-date-picker v-model="form.scheduledAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择已约定的面试时间" :disabled="saving" /></el-form-item>
          <div class="full-span cell-subtitle">轮次自动计算，保存后同步到面试记录和时间图。</div>
          <el-button class="full-span interview-details-toggle" link type="primary" @click="showInterviewDetails = !showInterviewDetails">面试细节：{{ labelOf(interviewTypeOptions,form.type) }} · {{ labelOf(interviewFormatOptions,form.format) }}（{{ showInterviewDetails ? '收起' : '可修改' }}）</el-button>
          <template v-if="showInterviewDetails"><el-form-item label="面试类型"><el-select v-model="form.type" :disabled="saving"><el-option v-for="item in interviewTypeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item><el-form-item label="面试形式"><el-select v-model="form.format" :disabled="saving"><el-option v-for="item in interviewFormatOptions" :key="item.value" v-bind="item" /></el-select></el-form-item></template>
        </template>
        <el-form-item :label="form.result === 'REJECTED' ? '原因（可选）' : '备注（可选）'" class="full-span"><el-input v-model="form.note" type="textarea" :rows="2" maxlength="500" :disabled="saving" :placeholder="form.result === 'REJECTED' ? '招聘方给出的原因，没有可留空' : '可填写面试地点、会议链接或沟通备注'" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveResult">{{ form.result === 'INTERVIEW' ? '确认面试安排' : '确认记录' }}</el-button></template>
    </el-dialog>

    <el-drawer v-model="historyVisible" title="阶段历史" size="480px">
      <div v-if="events.length === 0" class="empty-card">暂无阶段事件</div>
      <el-timeline v-else>
        <el-timeline-item v-for="event in events" :key="event.id" :timestamp="event.occurredAt.replace('T', ' ').slice(0, 16)" placement="top">
          <strong>{{ event.fromStage ? labelOf(stageOptions, event.fromStage) : '开始' }} → {{ labelOf(stageOptions, event.toStage) }}</strong>
          <p class="cell-subtitle">{{ event.note || '无备注' }}</p>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
  </section>
</template>

<style scoped>
.interview-details-toggle {justify-self:start;margin:0;}
</style>
