<script setup lang="ts">
import TierBadge from '@/common/components/TierBadge.vue';
import {companyApi} from '@/company/api/companyApi';
import {interviewApi} from '@/interview/api/interviewApi';
import {pipelineApi} from '@/pipeline/api/pipelineApi';
import {postingApi} from '@/posting/api/postingApi';
import {resumeApi} from '@/resume/api/resumeApi';
import type {Company, Direction, Interview, Posting, PostingSave, ResumeVersion, Stage, StageChange, StageEvent, Tier} from '@/common/model/domain';
import {directionOptions, interviewStatusOptions, labelOf, recommendationOptions, sourceOptions, stageOptions, tierOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import {commuteSummary} from '@/common/utils/commute';
import dayjs from 'dayjs';
import {ElMessage} from 'element-plus';
import {computed, onMounted, reactive, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();

const rows = ref<Posting[]>([]);
const companies = ref<Company[]>([]);
const resumes = ref<ResumeVersion[]>([]);
const loading = ref(false);
const total = ref(0);
const dialogVisible = ref(false);
const detailVisible = ref(false);
const detail = ref<Posting>();
const detailEvents = ref<StageEvent[]>([]);
const detailInterviews = ref<Interview[]>([]);
const editingId = ref<number>();
const applyingPosting = ref<Posting>();
const applyDialogVisible = ref(false);
const filters = reactive<{keyword: string; companyId?: number; direction?: Direction; tier?: Tier; stage?: Stage}>({keyword: ''});
const preApplicationStages: Stage[] = ['COLLECTED', 'SCREENED', 'TO_CONTACT', 'READY_TO_APPLY'];
const applicationStages: Stage[] = ['APPLIED', 'HR_SCREEN', 'WRITTEN_TEST', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
const applyForm = reactive<StageChange>({toStage: 'APPLIED', appliedAt: '', nextAction: '', nextActionAt: '', note: ''});

const emptyForm = (): PostingSave => ({
  companyId: 0, title: '', direction: 'JAVA_BACKEND', source: 'BOSS', sourceUrl: '', rawJd: '', location: '',
  salaryMinK: undefined, salaryMaxK: undefined, salaryMonths: 13, experienceMin: undefined, experienceMax: undefined,
  publishedAt: '', recruiterActiveAt: '', officialSynchronized: false, requiredSkills: '', bonusSkills: '', matchPoints: '',
  skillGaps: '', riskNotes: '', blockingRisk: false, matchScore: 0, companyScore: 0, freshnessScore: 0,
  commuteScore: 0, salaryScore: 0, tier: undefined, recommendation: undefined, manualOverrideReason: '',
});
const form = reactive<PostingSave>(emptyForm());
const scoreTotal = computed(() => form.matchScore + form.companyScore + form.freshnessScore + form.commuteScore + form.salaryScore);
const predictedTier = computed<Tier>(() => form.blockingRisk || scoreTotal.value < 50 ? 'SKIP' : scoreTotal.value >= 80 ? 'S' : scoreTotal.value >= 65 ? 'A' : 'B');

const load = async () => {
  loading.value = true;
  try {
    const response = await postingApi.list({
      keyword: filters.keyword || undefined,
      companyId: filters.companyId || undefined,
      direction: filters.direction || undefined,
      tier: filters.tier || undefined,
      stage: filters.stage || undefined,
      size: 100,
    });
    rows.value = response.result;
    total.value = response.page.totalElements;
  } catch (error) { showRequestError(error, 'JD 列表加载失败'); }
  finally { loading.value = false; }
};

const search = async () => {
  const query: Record<string, string> = {};
  if (filters.companyId) query.companyId = filters.companyId.toString();
  if (filters.direction) query.direction = filters.direction;
  if (filters.tier) query.tier = filters.tier;
  if (filters.stage) query.stage = filters.stage;
  await router.replace({path: '/postings', query});
  await load();
};

const loadCompanies = async () => {
  try { companies.value = (await companyApi.list({size: 100})).result.filter((item) => item.active); }
  catch (error) { showRequestError(error, '公司列表加载失败'); }
};

const loadResumes = async () => {
  try { resumes.value = await resumeApi.list({active: true}); }
  catch (error) { showRequestError(error, '简历版本加载失败'); }
};

const canApply = (row: Posting) => row.tier !== 'SKIP' && preApplicationStages.includes(row.stage);
const isInPipeline = (row: Posting) => applicationStages.includes(row.stage);

const openApply = (row: Posting) => {
  if (!resumes.value.length) {
    ElMessage.warning('请先建立一个启用的简历版本');
    return;
  }
  applyingPosting.value = row;
  Object.assign(applyForm, {
    toStage: 'APPLIED' as Stage,
    resumeVersionId: undefined,
    appliedAt: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    nextAction: '',
    nextActionAt: '',
    note: '',
  });
  applyDialogVisible.value = true;
};

const saveApplication = async () => {
  if (!applyingPosting.value) return;
  if (!applyForm.resumeVersionId) { ElMessage.warning('请选择实际投递使用的简历'); return; }
  if (!applyForm.appliedAt) { ElMessage.warning('请填写实际投递时间'); return; }
  const hasAction = Boolean(applyForm.nextAction?.trim());
  const hasActionTime = Boolean(applyForm.nextActionAt);
  if (hasAction !== hasActionTime) { ElMessage.warning('下一步动作和时间需要一起填写，暂时没有待办可都留空'); return; }
  try {
    await pipelineApi.changeStage(applyingPosting.value.id, {
      ...applyForm,
      toStage: 'APPLIED',
      nextAction: hasAction ? applyForm.nextAction?.trim() : undefined,
      nextActionAt: hasActionTime ? applyForm.nextActionAt : undefined,
    });
    ElMessage.success('已记录投递并进入 Pipeline');
    applyDialogVisible.value = false;
    await load();
  } catch (error) { showRequestError(error, '记录投递失败'); }
};

const openCreate = () => {
  editingId.value = undefined;
  Object.assign(form, emptyForm());
  if (companies.value.length === 1) form.companyId = companies.value[0].id;
  dialogVisible.value = true;
};

const openEdit = (row: Posting) => {
  editingId.value = row.id;
  Object.assign(form, {
    companyId: row.companyId, title: row.title, direction: row.direction, source: row.source,
    sourceUrl: row.sourceUrl ?? '', rawJd: row.rawJd, location: row.location ?? '', salaryMinK: row.salaryMinK,
    salaryMaxK: row.salaryMaxK, salaryMonths: row.salaryMonths, experienceMin: row.experienceMin,
    experienceMax: row.experienceMax, publishedAt: row.publishedAt ?? '', recruiterActiveAt: row.recruiterActiveAt ?? '',
    officialSynchronized: row.officialSynchronized ?? false, requiredSkills: row.requiredSkills ?? '',
    bonusSkills: row.bonusSkills ?? '', matchPoints: row.matchPoints ?? '', skillGaps: row.skillGaps ?? '',
    riskNotes: row.riskNotes ?? '', blockingRisk: row.blockingRisk, matchScore: row.matchScore,
    companyScore: row.companyScore, freshnessScore: row.freshnessScore, commuteScore: row.commuteScore,
    salaryScore: row.salaryScore, tier: row.tier, recommendation: row.recommendation,
    manualOverrideReason: row.manualOverrideReason ?? '',
  });
  dialogVisible.value = true;
};

const openDetail = async (row: Posting) => {
  try {
    const [posting, events, interviews] = await Promise.all([
      postingApi.get(row.id), pipelineApi.events(row.id), interviewApi.list({postingId: row.id}),
    ]);
    detail.value = posting;
    detailEvents.value = events;
    detailInterviews.value = interviews;
    detailVisible.value = true;
  } catch (error) { showRequestError(error, 'JD 详情加载失败'); }
};

const save = async () => {
  if (!form.companyId || !form.title.trim() || !form.rawJd.trim()) {
    ElMessage.warning('请填写公司、岗位名称和 JD 原文'); return;
  }
  try {
    await postingApi.save({...form}, editingId.value);
    ElMessage.success(editingId.value ? 'JD 已更新' : 'JD 已收集并完成评分');
    dialogVisible.value = false; await load();
  } catch (error) { showRequestError(error); }
};

const exportCsv = async () => {
  try { await postingApi.exportCsv({...filters}); ElMessage.success('CSV 已导出'); }
  catch (error) { showRequestError(error, '导出失败'); }
};

onMounted(async () => {
  const routeCompanyId = Number(route.query.companyId);
  if (Number.isInteger(routeCompanyId) && routeCompanyId > 0) filters.companyId = routeCompanyId;
  if (typeof route.query.direction === 'string' && directionOptions.some(item => item.value === route.query.direction)) filters.direction = route.query.direction as Direction;
  if (typeof route.query.tier === 'string' && tierOptions.some(item => item.value === route.query.tier)) filters.tier = route.query.tier as Tier;
  if (typeof route.query.stage === 'string' && stageOptions.some(item => item.value === route.query.stage)) filters.stage = route.query.stage as Stage;
  await Promise.all([load(), loadCompanies(), loadResumes()]);
});
</script>

<template>
  <section class="page-stack">
    <div class="page-toolbar wrap-toolbar">
      <div class="toolbar-search wide-search">
        <el-input v-model="filters.keyword" clearable placeholder="搜索岗位或 JD 原文" @keyup.enter="search" />
        <el-select v-model="filters.companyId" clearable filterable placeholder="公司"><el-option v-for="item in companies" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-select v-model="filters.direction" clearable placeholder="岗位方向"><el-option v-for="item in directionOptions" :key="item.value" v-bind="item" /></el-select>
        <el-select v-model="filters.tier" clearable placeholder="等级"><el-option v-for="item in tierOptions" :key="item.value" v-bind="item"><TierBadge :tier="item.value" /></el-option></el-select>
        <el-select v-model="filters.stage" clearable placeholder="阶段"><el-option v-for="item in stageOptions" :key="item.value" v-bind="item" /></el-select>
        <el-button @click="search">查询</el-button>
      </div>
      <div class="toolbar-actions">
        <el-button @click="router.push('/postings/knowledge-graph')">知识图谱</el-button>
        <el-button @click="router.push('/criteria')">JD门槛</el-button>
        <el-button @click="exportCsv">导出 CSV</el-button>
        <el-button type="primary" :disabled="companies.length === 0" @click="openCreate">新增 JD</el-button>
      </div>
    </div>
    <el-alert title="通勤按已保存的 JD 门槛核实：以实际出发地和办公地点为准，计入候车、换乘与步行；地址不明先核实。" type="info" show-icon :closable="false" />
    <div class="tier-legend" aria-label="等级颜色说明"><span>等级</span><TierBadge v-for="item in tierOptions" :key="item.value" :tier="item.value" /><span class="cell-subtitle">岗位档位与通勤分开判断；S/A 不代表已通过通勤硬筛选。</span></div>
    <el-alert v-if="companies.length === 0" title="请先在公司库新增一家公司，再录入 JD。" type="warning" :closable="false" />
    <div class="table-panel">
      <el-table v-loading="loading" :data="rows" stripe empty-text="还没有 JD，开始收集第一条真实岗位">
        <el-table-column label="公司 / 岗位" min-width="250">
          <template #default="{row}"><strong>{{ row.title }}</strong><div class="cell-subtitle">{{ row.companyName }} · {{ row.location || '地点待核实' }}</div></template>
        </el-table-column>
        <el-table-column label="方向" width="120"><template #default="{row}">{{ labelOf(directionOptions, row.direction) }}</template></el-table-column>
        <el-table-column label="薪资" width="110"><template #default="{row}">{{ row.salaryMinK == null ? '-' : `${row.salaryMinK}–${row.salaryMaxK}K` }}</template></el-table-column>
        <el-table-column label="评分 ↓" width="90"><template #default="{row}"><strong>{{ row.totalScore }}</strong> / 100</template></el-table-column>
        <el-table-column label="等级" width="80"><template #default="{row}"><TierBadge :tier="row.tier" /></template></el-table-column>
        <el-table-column label="通勤证据 / 条件估算" min-width="220"><template #default="{row}"><span class="commute-status">{{ commuteSummary(row.riskNotes).status }}</span><div class="cell-subtitle">{{ commuteSummary(row.riskNotes).estimate }}</div></template></el-table-column>
        <el-table-column label="阶段" width="110"><template #default="{row}">{{ labelOf(stageOptions, row.stage) }}</template></el-table-column>
        <el-table-column label="下一步" min-width="190"><template #default="{row}">{{ row.nextAction || '-' }}<div class="cell-subtitle">{{ row.nextActionAt?.replace('T', ' ').slice(0, 16) || '' }}</div></template></el-table-column>
        <el-table-column label="操作" width="210" fixed="right"><template #default="{row}"><el-button link @click="openDetail(row)">详情</el-button><el-button link @click="openEdit(row)">编辑</el-button><el-button v-if="canApply(row)" link type="primary" @click="openApply(row)">投递</el-button><span v-else-if="isInPipeline(row)" class="cell-subtitle">已在 Pipeline</span></template></el-table-column>
      </el-table>
      <div class="table-footer">共 {{ total }} 条岗位</div>
    </div>

    <el-dialog v-model="applyDialogVisible" :title="`记录投递：${applyingPosting?.companyName || ''} · ${applyingPosting?.title || ''}`" width="680px">
      <el-alert title="仅在已经向招聘方提交简历后记录；确认后该岗位才会进入 Pipeline。" type="info" :closable="false" />
      <el-form label-position="top" class="form-grid two-columns application-form">
        <el-form-item label="实际使用简历" required><el-select v-model="applyForm.resumeVersionId" filterable><el-option v-for="item in resumes" :key="item.id" :label="`${item.name} · ${item.versionLabel}`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="实际投递时间" required><el-date-picker v-model="applyForm.appliedAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="下一步动作（可选）"><el-input v-model="applyForm.nextAction" placeholder="例如：三天后跟进 HR；暂无可留空" /></el-form-item>
        <el-form-item label="下一步时间（可选）"><el-date-picker v-model="applyForm.nextActionAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="投递备注" class="full-span"><el-input v-model="applyForm.note" type="textarea" :rows="3" placeholder="例如：BOSS 直聘已读、官网投递编号等" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="applyDialogVisible = false">取消</el-button><el-button type="primary" @click="saveApplication">确认已投递</el-button></template>
    </el-dialog>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 JD 与评分' : '收集新 JD'" width="min(1040px, 94vw)" top="4vh">
      <el-form label-position="top" class="form-grid three-columns posting-form">
        <el-form-item label="公司" required><el-select v-model="form.companyId" filterable><el-option v-for="item in companies" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="岗位名称" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="岗位方向" required><el-select v-model="form.direction"><el-option v-for="item in directionOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="来源" required><el-select v-model="form.source"><el-option v-for="item in sourceOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="岗位链接"><el-input v-model="form.sourceUrl" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="月薪下限 K"><el-input-number v-model="form.salaryMinK" :min="0" /></el-form-item>
        <el-form-item label="月薪上限 K"><el-input-number v-model="form.salaryMaxK" :min="0" /></el-form-item>
        <el-form-item label="薪资月数"><el-input-number v-model="form.salaryMonths" :min="1" :max="24" /></el-form-item>
        <el-form-item label="最低经验"><el-input-number v-model="form.experienceMin" :min="0" /></el-form-item>
        <el-form-item label="最高经验"><el-input-number v-model="form.experienceMax" :min="0" /></el-form-item>
        <el-form-item label="发布日期"><el-date-picker v-model="form.publishedAt" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="招聘者最近活跃"><el-date-picker v-model="form.recruiterActiveAt" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="官网同步"><el-switch v-model="form.officialSynchronized" /></el-form-item>
        <el-form-item label="阻断风险"><el-switch v-model="form.blockingRisk" active-text="是" inactive-text="否" /></el-form-item>
        <el-form-item label="JD 原文" class="full-span" required><el-input v-model="form.rawJd" type="textarea" :rows="7" placeholder="直接粘贴完整 JD" /></el-form-item>
        <el-form-item label="必选技术"><el-input v-model="form.requiredSkills" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="加分项"><el-input v-model="form.bonusSkills" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="自身匹配点"><el-input v-model="form.matchPoints" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="技能缺口"><el-input v-model="form.skillGaps" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="风险说明" class="two-span"><el-input v-model="form.riskNotes" type="textarea" :rows="4" /></el-form-item>
        <div class="score-editor full-span">
          <div class="score-summary"><div><span>预测总分</span><strong>{{ scoreTotal }}</strong></div><TierBadge :tier="predictedTier" /></div>
          <el-form-item label="匹配度 /35"><el-input-number v-model="form.matchScore" :min="0" :max="35" /></el-form-item>
          <el-form-item label="公司 /20"><el-input-number v-model="form.companyScore" :min="0" :max="20" /></el-form-item>
          <el-form-item label="新鲜度 /15"><el-input-number v-model="form.freshnessScore" :min="0" :max="15" /></el-form-item>
          <el-form-item label="通勤 /15"><el-input-number v-model="form.commuteScore" :min="0" :max="15" /></el-form-item>
          <el-form-item label="薪资 /15"><el-input-number v-model="form.salaryScore" :min="0" :max="15" /></el-form-item>
        </div>
        <el-form-item label="人工等级"><el-select v-model="form.tier" clearable placeholder="默认自动计算"><el-option v-for="item in tierOptions" :key="item.value" v-bind="item"><TierBadge :tier="item.value" /></el-option></el-select></el-form-item>
        <el-form-item label="建议动作"><el-select v-model="form.recommendation" clearable placeholder="默认自动计算"><el-option v-for="item in recommendationOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="人工覆盖原因"><el-input v-model="form.manualOverrideReason" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存并评分</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="JD 详情" size="620px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="公司">{{ detail.companyName }}</el-descriptions-item>
          <el-descriptions-item label="岗位">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="方向">{{ labelOf(directionOptions, detail.direction) }}</el-descriptions-item>
          <el-descriptions-item label="等级 / 总分"><TierBadge :tier="detail.tier" /> / {{ detail.totalScore }}</el-descriptions-item>
          <el-descriptions-item label="阶段">{{ labelOf(stageOptions, detail.stage) }}</el-descriptions-item>
          <el-descriptions-item label="投递简历"><el-button v-if="detail.resumeVersionId" link type="primary" @click="router.push(`/resumes/${detail.resumeVersionId}/view`)">{{ detail.resumeVersionName || '查看简历' }}</el-button><span v-else>-</span></el-descriptions-item>
          <el-descriptions-item label="地点">{{ detail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下一步">{{ detail.nextAction || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h3>通勤证据（与岗位等级独立）</h3>
        <p class="commute-status">{{ commuteSummary(detail.riskNotes).status }} · {{ commuteSummary(detail.riskNotes).estimate }}</p>
        <p class="pre-line">{{ commuteSummary(detail.riskNotes).address }}</p>
        <p class="pre-line">{{ commuteSummary(detail.riskNotes).route }}</p>
        <p class="cell-subtitle">条件估算不是工作日地图实测；总部地址不等于该岗位办公点。详细来源与待确认事项见下方风险说明。</p>
        <h3>评分依据</h3>
        <p>匹配 {{ detail.matchScore }}/35 · 公司 {{ detail.companyScore }}/20 · 新鲜度 {{ detail.freshnessScore }}/15 · 通勤 {{ detail.commuteScore }}/15 · 薪资 {{ detail.salaryScore }}/15</p>
        <h3>技能与风险</h3>
        <p class="pre-line">必选技术：{{ detail.requiredSkills || '-' }}\n加分项：{{ detail.bonusSkills || '-' }}\n匹配点：{{ detail.matchPoints || '-' }}\n技能缺口：{{ detail.skillGaps || '-' }}\n风险：{{ detail.riskNotes || '-' }}</p>
        <h3>JD 原文</h3>
        <p class="pre-line">{{ detail.rawJd }}</p>
        <h3>阶段历史</h3>
        <el-timeline v-if="detailEvents.length">
          <el-timeline-item v-for="event in detailEvents" :key="event.id" :timestamp="event.occurredAt.replace('T', ' ').slice(0, 16)">
            {{ event.fromStage ? labelOf(stageOptions, event.fromStage) : '开始' }} → {{ labelOf(stageOptions, event.toStage) }} · {{ event.note || '无备注' }}
          </el-timeline-item>
        </el-timeline>
        <p v-else class="cell-subtitle">暂无阶段事件</p>
        <h3>面试记录</h3>
        <el-table v-if="detailInterviews.length" :data="detailInterviews" size="small">
          <el-table-column prop="roundNo" label="轮次" width="70" />
          <el-table-column label="时间" width="145"><template #default="{row}">{{ row.scheduledAt.replace('T', ' ').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="状态"><template #default="{row}">{{ labelOf(interviewStatusOptions, row.status) }}</template></el-table-column>
          <el-table-column prop="nextStep" label="复盘 / 下一步" show-overflow-tooltip />
        </el-table>
        <p v-else class="cell-subtitle">暂无面试记录</p>
      </template>
    </el-drawer>
  </section>
</template>
