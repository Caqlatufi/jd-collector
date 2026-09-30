<script setup lang="ts">
import TierBadge from '@/common/components/TierBadge.vue';
import {pipelineApi} from '@/pipeline/api/pipelineApi';
import {postingApi} from '@/posting/api/postingApi';
import {resumeApi} from '@/resume/api/resumeApi';
import type {Direction, Posting, ResumeVersion, Stage, StageChange, StageEvent, Tier} from '@/common/model/domain';
import {directionOptions, labelOf, stageOptions, tierOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import dayjs from 'dayjs';
import {ElMessage} from 'element-plus';
import {computed, onMounted, reactive, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();

const rows = ref<Posting[]>([]);
const resumes = ref<ResumeVersion[]>([]);
const loading = ref(false);
const stageFilter = ref<Stage>();
const directionFilter = ref<Direction>();
const tierFilter = ref<Tier>();
const dialogVisible = ref(false);
const historyVisible = ref(false);
const selected = ref<Posting>();
const events = ref<StageEvent[]>([]);

const form = reactive<StageChange>({toStage: 'APPLIED', nextAction: '', nextActionAt: ''});
const terminalStages: Stage[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
const appliedStages: Stage[] = ['APPLIED', 'HR_SCREEN', 'WRITTEN_TEST', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
const pipelineStageOptions = stageOptions.filter(item => appliedStages.includes(item.value));
const requiresResume = computed(() => appliedStages.includes(form.toStage));
const focusedPostingId = computed(() => Number(route.query.postingId) || undefined);
const visibleRows = computed(() => rows.value.filter(row => (!stageFilter.value || row.stage === stageFilter.value) && (!focusedPostingId.value || row.id === focusedPostingId.value)));

const load = async () => {
  loading.value = true;
  try {
    const [postings, resumeRows] = await Promise.all([
      postingApi.list({direction: directionFilter.value || undefined, tier: tierFilter.value || undefined, size: 100}),
      resumeApi.list({active: true}),
    ]);
    rows.value = postings.result.filter(row => appliedStages.includes(row.stage));
    if (focusedPostingId.value && !rows.value.some(row => row.id === focusedPostingId.value)) {
      const focused = await postingApi.get(focusedPostingId.value);
      if (appliedStages.includes(focused.stage)) rows.value.push(focused);
    }
    resumes.value = resumeRows;
  } catch (error) { showRequestError(error, '投递流程加载失败'); }
  finally { loading.value = false; }
};

const openAdvance = (row: Posting) => {
  selected.value = row;
  Object.assign(form, {
    toStage: row.stage,
    resumeVersionId: row.resumeVersionId,
    appliedAt: row.appliedAt ?? dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    nextAction: row.nextAction ?? '',
    nextActionAt: row.nextActionAt ?? '',
    note: '',
  });
  dialogVisible.value = true;
};

const saveStage = async () => {
  if (!selected.value) return;
  if (requiresResume.value && !form.resumeVersionId) { ElMessage.warning('已投递及后续阶段必须选择简历'); return; }
  const hasAction = Boolean(form.nextAction?.trim());
  const hasActionTime = Boolean(form.nextActionAt);
  if (hasAction !== hasActionTime) { ElMessage.warning('下一步动作和时间需要一起填写，暂时没有待办可都留空'); return; }
  try {
    await pipelineApi.changeStage(selected.value.id, {...form, appliedAt: requiresResume.value ? form.appliedAt : selected.value.appliedAt});
    ElMessage.success('阶段和下一步已更新'); dialogVisible.value = false; await load();
  } catch (error) { showRequestError(error); }
};

const showHistory = async (row: Posting) => {
  selected.value = row;
  try { events.value = await pipelineApi.events(row.id); historyVisible.value = true; }
  catch (error) { showRequestError(error, '阶段历史加载失败'); }
};

const applyFilters = async () => {
  await router.replace({path: '/pipeline', query: stageFilter.value ? {stage: stageFilter.value} : {}});
  await load();
};

onMounted(async () => {
  const routeStage = route.query.stage;
  if (typeof routeStage === 'string' && pipelineStageOptions.some(item => item.value === routeStage)) stageFilter.value = routeStage as Stage;
  await load();
});
</script>

<template>
  <section class="page-stack">
    <el-alert v-if="focusedPostingId" title="正在查看从计划时间图定位的岗位" type="info" :closable="false"><el-button link @click="router.replace({path:'/pipeline'}).then(load)">查看全部岗位</el-button></el-alert>
    <div class="page-toolbar">
      <div class="toolbar-search">
        <el-select v-model="stageFilter" clearable placeholder="筛选当前阶段" @change="applyFilters"><el-option v-for="item in pipelineStageOptions" :key="item.value" v-bind="item" /></el-select>
        <el-select v-model="directionFilter" clearable placeholder="筛选方向" @change="load"><el-option v-for="item in directionOptions" :key="item.value" v-bind="item" /></el-select>
        <el-select v-model="tierFilter" clearable placeholder="筛选等级" @change="load"><el-option v-for="item in tierOptions" :key="item.value" v-bind="item"><TierBadge :tier="item.value" /></el-option></el-select>
        <span class="toolbar-note">这里只显示已经实际投递的岗位；下一步有安排时再填写</span>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>
    <div class="pipeline-summary">
      <button v-for="item in pipelineStageOptions" :key="item.value" type="button" :class="{active: stageFilter === item.value}" @click="stageFilter = item.value; applyFilters()">
        <span>{{ item.label }}</span><strong>{{ rows.filter(row => row.stage === item.value).length }}</strong>
      </button>
    </div>
    <div class="table-panel">
      <el-table v-loading="loading" :data="visibleRows" stripe empty-text="还没有已投递岗位，请先从 JD 列表点击“投递”">
        <el-table-column label="公司 / 岗位" min-width="250"><template #default="{row}"><strong>{{ row.title }}</strong><div class="cell-subtitle">{{ row.companyName }} · {{ labelOf(directionOptions, row.direction) }}</div></template></el-table-column>
        <el-table-column label="等级" width="85"><template #default="{row}"><TierBadge :tier="row.tier" /></template></el-table-column>
        <el-table-column label="阶段" width="120"><template #default="{row}">{{ labelOf(stageOptions, row.stage) }}</template></el-table-column>
        <el-table-column label="投递简历" width="180"><template #default="{row}"><el-button v-if="row.resumeVersionId" link type="primary" @click="router.push(`/resumes/${row.resumeVersionId}/view`)">{{ row.resumeVersionName || '查看简历' }}</el-button><span v-else>-</span></template></el-table-column>
        <el-table-column label="下一步" min-width="240"><template #default="{row}"><strong>{{ row.nextAction || '暂无待办' }}</strong><div class="cell-subtitle">{{ row.nextActionAt?.replace('T', ' ').slice(0, 16) || '' }}</div></template></el-table-column>
        <el-table-column label="操作" width="155" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openAdvance(row)">推进</el-button><el-button link @click="showHistory(row)">历史</el-button></template></el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="`推进：${selected?.companyName || ''} · ${selected?.title || ''}`" width="680px">
      <el-form label-position="top" class="form-grid two-columns">
        <el-form-item label="目标阶段" required><el-select v-model="form.toStage"><el-option v-for="item in pipelineStageOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="使用简历" :required="requiresResume"><el-select v-model="form.resumeVersionId" clearable><el-option v-if="selected?.resumeVersionId && !resumes.some(item => item.id === selected?.resumeVersionId)" :value="selected.resumeVersionId" :label="`${selected.resumeVersionName} · 历史投递版本`" /><el-option v-for="item in resumes" :key="item.id" :label="`${item.name} · ${item.versionLabel}`" :value="item.id" /></el-select></el-form-item>
        <el-form-item v-if="requiresResume" label="首次投递时间" required><el-date-picker v-model="form.appliedAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item v-if="!terminalStages.includes(form.toStage)" label="下一步时间（可选）"><el-date-picker v-model="form.nextActionAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item v-if="!terminalStages.includes(form.toStage)" label="下一步动作（可选）" class="full-span"><el-input v-model="form.nextAction" placeholder="有明确待办时与时间一起填写；暂无可留空" /></el-form-item>
        <el-form-item label="阶段备注" class="full-span"><el-input v-model="form.note" type="textarea" :rows="4" placeholder="沟通结果、失败原因或回退理由" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="saveStage">确认更新</el-button></template>
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
