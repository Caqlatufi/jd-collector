<script setup lang="ts">
import {loadDirectionOptions} from '@/common/api/directions';
import TierBadge from '@/common/components/TierBadge.vue';
import PostingImportDialog from '@/posting/components/PostingImportDialog.vue';
import PostingGreetingDialog from '@/posting/components/PostingGreetingDialog.vue';
import PostingCommute from '@/posting/components/PostingCommute.vue';
import PostingBossCompetition from '@/posting/components/PostingBossCompetition.vue';
import {companyApi} from '@/company/api/companyApi';
import {interviewApi} from '@/interview/api/interviewApi';
import {pipelineApi} from '@/pipeline/api/pipelineApi';
import {postingApi} from '@/posting/api/postingApi';
import {resumeApi} from '@/resume/api/resumeApi';
import type {Company, Direction, Interview, Posting, ResumeVersion, Stage, StageChange, StageEvent, Tier} from '@/common/model/domain';
import {contactStageOptions, directionOptions, interviewStatusOptions, labelOf, stageOptions, tierOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import {commuteSummary} from '@/common/utils/commute';
import {desktop} from '@/common/desktop/client';
import dayjs from 'dayjs';
import {ElMessage} from 'element-plus';
import {computed, onMounted, reactive, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();

const rows = ref<Posting[]>([]);
const companies = ref<Company[]>([]);
const officialChannels = computed(() => new Map(companies.value.map(company => [company.id, company.officialApplicationUrl])));
const openOfficialApplication = async (row: Posting) => {
  const url = officialChannels.value.get(row.companyId);
  if (!url) return;
  try {
    await desktop.request('browser.open', {
      key: `company-careers:${row.companyId}`, url, title: `${row.companyName} · 官方招聘`,
    });
  } catch (error) { showRequestError(error, '官方招聘页面打开失败'); }
};
const resumes = ref<ResumeVersion[]>([]);
const loading = ref(false);
const total = ref(0);
const dialogVisible = ref(false);
const detailVisible = ref(false);
const detail = ref<Posting>();
const detailEvents = ref<StageEvent[]>([]);
const detailInterviews = ref<Interview[]>([]);
const applyingPosting = ref<Posting>();
const applyDialogVisible = ref(false);
const greetingVisible = ref(false);
const greetingPosting = ref<Posting>();
const linkVisible = ref(false);
const linkSaving = ref(false);
const linkPosting = ref<Posting>();
const linkError = ref('');
const linkForm = reactive({sourceUrl: '', expectedSourceUrl: ''});
const openingJd = reactive(new Set<number>());
const openJd = async (row: Posting) => {
  const url = row.sourceUrl?.trim();
  if (!url || openingJd.has(row.id)) return;
  openingJd.add(row.id);
  try {
    await desktop.request('browser.open', {
      key: `posting:${row.id}`, url, title: `${row.companyName} · ${row.title}`.slice(0, 120),
    });
  } catch (error) { showRequestError(error, 'JD 页面打开失败'); }
  finally { openingJd.delete(row.id); }
};
const openGreeting = (row: Posting) => {
  greetingPosting.value = row;
  greetingVisible.value = true;
};
const filters = reactive<{keyword: string; companyId?: number; direction?: Direction; tier?: Tier; stage?: Stage; sortBy: 'SCORE' | 'BOSS_COMPETITION'}>({keyword: '', sortBy: 'BOSS_COMPETITION'});
const preApplicationStages = contactStageOptions.map(item => item.value);
const stageSaving = reactive(new Set<number>());
const archiving = reactive(new Set<number>());
const applicationStages: Stage[] = ['APPLIED', 'HR_SCREEN', 'WRITTEN_TEST', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
const applyForm = reactive<Pick<StageChange, 'toStage' | 'resumeVersionId' | 'appliedAt' | 'note'>>({
  toStage: 'APPLIED', appliedAt: '', note: '',
});

const load = async () => {
  loading.value = true;
  try {
    await loadDirectionOptions();
    const response = await postingApi.list({
      keyword: filters.keyword || undefined,
      companyId: filters.companyId || undefined,
      direction: filters.direction || undefined,
      tier: filters.tier || undefined,
      stage: filters.stage || undefined,
      sortBy: filters.sortBy,
      size: 100,
    });
    rows.value = response.result;
    total.value = response.page.totalElements;
  } catch (error) { showRequestError(error, 'JD 列表加载失败'); }
  finally { loading.value = false; }
};

const search = async () => {
  filters.keyword = filters.keyword.trim();
  const query: Record<string, string> = {};
  query.sortBy = filters.sortBy;
  if (filters.keyword.trim()) query.keyword = filters.keyword.trim();
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

const isInPipeline = (row: Posting) => Boolean(row.appliedAt) || applicationStages.includes(row.stage);
const openPipeline = (row: Posting) => router.push({
  path: '/pipeline', query: {keyword: row.title, postingId: String(row.id)},
});
const canEditContactStage = (row: Posting) => !isInPipeline(row) && preApplicationStages.includes(row.stage);
const canApply = (row: Posting) => row.tier !== 'SKIP' && row.stage !== 'CLOSED' && canEditContactStage(row);
const canMarkGreetingSent = computed(() => Boolean(greetingPosting.value && canEditContactStage(greetingPosting.value)
  && greetingPosting.value.stage !== 'MESSAGE_SENT' && !archiving.has(greetingPosting.value.id)));

const syncPosting = (updated: Posting) => {
  if (detail.value?.id === updated.id) detail.value = updated;
  if (greetingPosting.value?.id === updated.id) greetingPosting.value = updated;
  const index = rows.value.findIndex(item => item.id === updated.id);
  if (index < 0) return;
  if (filters.stage && filters.stage !== updated.stage) {
    rows.value.splice(index, 1);
    total.value = Math.max(0, total.value - 1);
  } else rows.value[index] = updated;
};

const openLinkForm = (row: Posting) => {
  linkPosting.value = row;
  Object.assign(linkForm, {sourceUrl: row.sourceUrl?.trim() ?? '', expectedSourceUrl: row.sourceUrl ?? ''});
  linkError.value = '';
  linkVisible.value = true;
};

const saveSourceUrl = async () => {
  if (!linkPosting.value || linkSaving.value) return;
  const url = linkForm.sourceUrl.trim();
  linkError.value = '';
  if (!url) { linkError.value = '请填写 JD 链接'; return; }
  if (url.length > 1000) { linkError.value = 'JD 链接不能超过1000个字符'; return; }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || /\s/.test(url)) {
      throw new Error('Invalid URL');
    }
  } catch {
    linkError.value = '请填写完整的 HTTPS 岗位链接';
    return;
  }
  linkSaving.value = true;
  try {
    syncPosting(await postingApi.saveSourceUrl(linkPosting.value.id, url, linkForm.expectedSourceUrl));
    linkVisible.value = false;
    ElMessage.success('JD 链接已保存');
  } catch (error) { showRequestError(error, 'JD 链接保存失败'); }
  finally { linkSaving.value = false; }
};

const onCommuteSaved = async (updated: Posting) => {
  syncPosting(updated);
  // 分数和自动等级可能变化，回读当前筛选的有序列表。
    await load();
};

const archivePosting = async (row: Posting) => {
  if (archiving.has(row.id) || stageSaving.has(row.id)) return;
  archiving.add(row.id);
  try {
    await postingApi.archive(row.id);
    rows.value = rows.value.filter(item => item.id !== row.id);
    total.value = Math.max(0, total.value - 1);
    if (detail.value?.id === row.id) {
      detailVisible.value = false;
      detail.value = undefined;
    }
    ElMessage.success('JD 已归档');
    await load();
  } catch (error) { showRequestError(error, 'JD 归档失败'); }
  finally { archiving.delete(row.id); }
};

const changeContactStage = async (row: Posting, toStage: Stage) => {
  if (!canEditContactStage(row) || stageSaving.has(row.id) || archiving.has(row.id) || toStage === row.stage) return false;
  stageSaving.add(row.id);
  try {
    syncPosting(await pipelineApi.changeContactStage(row.id, toStage, row.stage));
    ElMessage.success('沟通阶段已保存');
    return true;
  } catch (error) {
    showRequestError(error, '沟通阶段保存失败');
    try { syncPosting(await postingApi.get(row.id)); }
    catch { /* Keep the last saved state if refreshing the failed row is also unavailable. */ }
    return false;
  } finally { stageSaving.delete(row.id); }
};

const markGreetingSent = async () => {
  const row = greetingPosting.value;
  if (!row || !canMarkGreetingSent.value) return;
  if (await changeContactStage(row, 'MESSAGE_SENT') && greetingPosting.value?.id === row.id) greetingVisible.value = false;
};

const openApply = (row: Posting) => {
  if (stageSaving.has(row.id) || archiving.has(row.id) || !canApply(row)) return;
  if (!resumes.value.length) {
    ElMessage.warning('请先建立一个启用的简历版本');
    return;
  }
  applyingPosting.value = row;
  Object.assign(applyForm, {
    toStage: 'APPLIED' as Stage,
    resumeVersionId: undefined,
    appliedAt: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    note: '',
  });
  applyDialogVisible.value = true;
};

const saveApplication = async () => {
  if (!applyingPosting.value) return;
  if (!applyForm.resumeVersionId) { ElMessage.warning('请选择实际投递使用的简历'); return; }
  if (!applyForm.appliedAt) { ElMessage.warning('请填写实际投递时间'); return; }
  try {
    await pipelineApi.changeStage(applyingPosting.value.id, {
      ...applyForm,
      toStage: 'APPLIED',
    });
    ElMessage.success('已记录投递并进入 Pipeline');
    applyDialogVisible.value = false;
    await load();
  } catch (error) { showRequestError(error, '记录投递失败'); }
};

const openCreate = () => { dialogVisible.value = true; };
const onImportCompleted = async () => { await Promise.all([load(), loadCompanies()]); };

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

onMounted(async () => {
  if (typeof route.query.keyword === 'string') filters.keyword = route.query.keyword;
  const routeCompanyId = Number(route.query.companyId);
  if (Number.isInteger(routeCompanyId) && routeCompanyId > 0) filters.companyId = routeCompanyId;
  if (typeof route.query.direction === 'string') filters.direction = route.query.direction as Direction;
  if (typeof route.query.tier === 'string' && tierOptions.some(item => item.value === route.query.tier)) filters.tier = route.query.tier as Tier;
  if (typeof route.query.stage === 'string' && stageOptions.some(item => item.value === route.query.stage)) filters.stage = route.query.stage as Stage;
  if (route.query.sortBy === 'SCORE' || route.query.sortBy === 'BOSS_COMPETITION') filters.sortBy = route.query.sortBy;
  await Promise.all([load(), loadCompanies(), loadResumes()]);
});
</script>

<template>
  <section class="page-stack">
    <div class="page-toolbar wrap-toolbar">
      <form class="toolbar-search wide-search" role="search" aria-label="JD 查询" @submit.prevent="search">
        <el-input v-model="filters.keyword" clearable placeholder="搜索公司、岗位或 JD 原文" aria-label="搜索公司、岗位或 JD 原文" @clear="search" />
        <el-select v-model="filters.direction" clearable placeholder="岗位方向" aria-label="岗位方向" @change="search"><el-option v-for="item in directionOptions" :key="item.value" v-bind="item" /></el-select>
        <el-select v-model="filters.stage" clearable placeholder="阶段" aria-label="阶段" @change="search"><el-option v-for="item in stageOptions" :key="item.value" v-bind="item" /></el-select>
        <el-button native-type="submit">查询</el-button>
      </form>
      <div class="toolbar-actions">
        <el-button @click="router.push('/postings/knowledge-graph')">知识图谱</el-button>
        <el-button @click="router.push('/criteria')">JD门槛</el-button>
        <el-button type="primary" @click="openCreate">新增 JD</el-button>
      </div>
    </div>
    <el-alert title="填写岗位实际单程通勤时间，提交后自动更新通勤分、总分和等级。" type="info" show-icon :closable="false" />
    <div class="tier-legend" aria-label="等级颜色说明"><span>等级</span><TierBadge v-for="item in tierOptions" :key="item.value" :tier="item.value" /><span class="cell-subtitle">等级由综合评分决定；通勤时间可单独修改。</span></div>
    <el-alert v-if="companies.length === 0" title="点击“新增 JD”粘贴岗位链接，收录时会核对并关联公司。" type="info" :closable="false" />
    <div class="table-panel">
      <el-table v-loading="loading" :data="rows" stripe empty-text="还没有 JD，开始收集第一条真实岗位">
        <el-table-column label="公司 / 岗位" min-width="250">
          <template #default="{row}">
            <button class="posting-title" type="button" @click="openDetail(row)">{{ row.title }}</button>
            <div class="cell-subtitle">{{ row.companyName }} · {{ row.location || '地点待核实' }}</div>
            <el-button v-if="officialChannels.get(row.companyId)" link type="primary" @click="openOfficialApplication(row)">官方招聘</el-button>
          </template>
        </el-table-column>
        <el-table-column :label="filters.sortBy === 'BOSS_COMPETITION' ? 'BOSS 竞争力 ↓' : 'BOSS 竞争力'" width="190">
          <template #default="{row}"><PostingBossCompetition :posting="row" /></template>
        </el-table-column>
        <el-table-column label="薪资" width="110"><template #default="{row}">{{ row.salaryMinK == null ? '-' : `${row.salaryMinK}–${row.salaryMaxK}K` }}</template></el-table-column>
        <el-table-column :label="filters.sortBy === 'SCORE' ? '评分 ↓' : '评分'" width="90"><template #default="{row}"><strong>{{ row.totalScore }}</strong> / 100</template></el-table-column>
        <el-table-column label="等级" width="80"><template #default="{row}"><TierBadge :tier="row.tier" /></template></el-table-column>
        <el-table-column label="通勤时间 / 备注" min-width="220">
          <template #default="{row}"><PostingCommute :posting="row" @saved="onCommuteSaved" /></template>
        </el-table-column>
        <el-table-column label="阶段" width="190">
          <template #default="{row}">
            <el-select v-if="canEditContactStage(row)" :model-value="row.stage" size="small"
              :aria-label="`${row.companyName} · ${row.title} · 投递前阶段`"
              :disabled="stageSaving.has(row.id) || archiving.has(row.id)" :loading="stageSaving.has(row.id)" style="width: 100%"
              @change="changeContactStage(row, $event)">
              <el-option v-for="item in contactStageOptions" :key="item.value" v-bind="item" />
            </el-select>
            <el-button v-else-if="isInPipeline(row)" link type="primary" @click="openPipeline(row)">{{ labelOf(stageOptions, row.stage) }}</el-button>
            <span v-else>{{ labelOf(stageOptions, row.stage) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{row}">
            <el-button v-if="row.sourceUrl?.trim()" link type="primary" :loading="openingJd.has(row.id)"
              title="在顶部标签打开岗位原页"
              @click="openJd(row)">打开 JD</el-button>
            <el-button v-else link type="primary" @click="openLinkForm(row)">填写链接</el-button>
            <el-button v-if="!isInPipeline(row)" link type="primary" :disabled="archiving.has(row.id)" @click="openGreeting(row)">打招呼</el-button>
            <el-button v-if="canApply(row)" link type="primary" :disabled="stageSaving.has(row.id) || archiving.has(row.id)" @click="openApply(row)">投递</el-button>
            <el-button link type="danger" :loading="archiving.has(row.id)" :disabled="stageSaving.has(row.id)" @click="archivePosting(row)">归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">共 {{ total }} 条岗位</div>
    </div>

    <PostingGreetingDialog v-model="greetingVisible" :posting="greetingPosting" :can-mark-sent="canMarkGreetingSent"
      :marking-sent="greetingPosting ? stageSaving.has(greetingPosting.id) : false" @message-sent="markGreetingSent" />

    <el-dialog v-model="linkVisible" title="填写 JD 链接" width="min(560px, 94vw)"
      :close-on-click-modal="!linkSaving" :close-on-press-escape="!linkSaving" :show-close="!linkSaving">
      <p>{{ linkPosting?.companyName }} · {{ linkPosting?.title }}</p>
      <el-form label-position="top" @submit.prevent="saveSourceUrl">
        <el-form-item label="JD 链接" required>
          <el-input v-model="linkForm.sourceUrl" aria-label="JD 链接" :maxlength="1000" :disabled="linkSaving"
            placeholder="粘贴该岗位的完整网页地址" @keydown.enter.prevent="saveSourceUrl" />
        </el-form-item>
        <el-alert v-if="linkError" :title="linkError" type="error" :closable="false" />
      </el-form>
      <template #footer>
        <el-button :disabled="linkSaving" @click="linkVisible = false">取消</el-button>
        <el-button type="primary" :loading="linkSaving" @click="saveSourceUrl">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="applyDialogVisible" :title="`记录投递：${applyingPosting?.companyName || ''} · ${applyingPosting?.title || ''}`" width="680px">
      <el-alert title="仅在已经向招聘方提交简历后记录；确认后该岗位才会进入 Pipeline。" type="info" :closable="false" />
      <el-form label-position="top" class="form-grid two-columns application-form">
        <el-form-item label="实际使用简历" required><el-select v-model="applyForm.resumeVersionId" filterable><el-option v-for="item in resumes" :key="item.id" :label="`${item.name} · ${item.versionLabel}`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="实际投递时间" required><el-date-picker v-model="applyForm.appliedAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="投递备注" class="full-span"><el-input v-model="applyForm.note" type="textarea" :rows="3" placeholder="例如：BOSS 直聘已读、官网投递编号等" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="applyDialogVisible = false">取消</el-button><el-button type="primary" @click="saveApplication">确认已投递</el-button></template>
    </el-dialog>

    <PostingImportDialog v-model="dialogVisible" @completed="onImportCompleted" />

    <el-drawer v-model="detailVisible" title="JD 详情" size="620px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="公司">{{ detail.companyName }}</el-descriptions-item>
          <el-descriptions-item label="岗位">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="方向">{{ labelOf(directionOptions, detail.direction) }}</el-descriptions-item>
          <el-descriptions-item label="BOSS 竞争力"><PostingBossCompetition :posting="detail" /></el-descriptions-item>
          <el-descriptions-item label="等级 / 总分"><TierBadge :tier="detail.tier" /> / {{ detail.totalScore }}</el-descriptions-item>
          <el-descriptions-item label="阶段">{{ labelOf(stageOptions, detail.stage) }}</el-descriptions-item>
          <el-descriptions-item label="投递简历"><el-button v-if="detail.resumeVersionId" link type="primary" @click="router.push(`/resumes/${detail.resumeVersionId}/view`)">{{ detail.resumeVersionName || '查看简历' }}</el-button><span v-else>-</span></el-descriptions-item>
          <el-descriptions-item label="地点">{{ detail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下一步">{{ detail.nextAction || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h3>通勤时间与备注</h3>
        <PostingCommute :posting="detail" @saved="onCommuteSaved" />
        <p class="pre-line">{{ commuteSummary(detail.riskNotes).address }}</p>
        <p class="pre-line">{{ commuteSummary(detail.riskNotes).route }}</p>
        <p class="cell-subtitle">通勤时间按填写值保存和计分。办公地点与路线说明见下方风险备注。</p>
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

<style scoped>
.posting-title {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.posting-title:hover, .posting-title:focus-visible {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.posting-title:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}
</style>
