<script setup lang="ts">
import type {Posting, ResumeSave, ResumeVersion} from '@/common/model/domain';
import {labelOf, resumeTypeOptions, stageOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import {postingApi} from '@/posting/api/postingApi';
import {resumeApi} from '@/resume/api/resumeApi';
import {ElMessage} from 'element-plus';
import {onBeforeUnmount, onMounted, reactive, ref} from 'vue';
import type {ComponentPublicInstance} from 'vue';
import {useRouter} from 'vue-router';

const router = useRouter();
const rows = ref<ResumeVersion[]>([]);
const loading = ref(false);
const archivingId = ref<number>();
const createVisible = ref(false);
const usageVisible = ref(false);
const usageResume = ref<ResumeVersion>();
const usageRows = ref<Posting[]>([]);
const starterLoading = ref(false);
const expandedNotes = reactive(new Set<number>());
const overflowingNotes = reactive(new Set<number>());
const notesElements = new Map<number, HTMLElement>();
const notesObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const element = entry.target as HTMLElement;
    const id = Number(element.dataset.resumeId);
    if (expandedNotes.has(id)) continue;
    if (element.scrollHeight > element.clientHeight + 1) overflowingNotes.add(id);
    else overflowingNotes.delete(id);
  }
});
const observeNotes = (id: number, element: Element | ComponentPublicInstance | null) => {
  const previous = notesElements.get(id);
  if (previous === element) return;
  if (previous) notesObserver.unobserve(previous);
  if (element instanceof HTMLElement) {
    notesElements.set(id, element);
    notesObserver.observe(element);
  } else notesElements.delete(id);
};
const toggleNotes = (id: number) => {
  if (expandedNotes.has(id)) expandedNotes.delete(id);
  else expandedNotes.add(id);
};
const form = reactive<ResumeSave>({name: '', type: 'JAVA_BACKEND', versionLabel: '', contentMarkdown: '', templateKey: 'CLASSIC_BLUE', photoUrl: '', active: true, notes: ''});

const load = async () => {
  loading.value = true;
  try { rows.value = await resumeApi.list(); }
  catch (error) { showRequestError(error, '简历版本加载失败'); }
  finally { loading.value = false; }
};
const openCreate = async () => {
  if (starterLoading.value) return;
  starterLoading.value = true;
  try {
    const starter = await resumeApi.starter();
    Object.assign(form, {name: '', type: 'JAVA_BACKEND', active: true, notes: '', ...starter});
    createVisible.value = true;
  } catch (error) { showRequestError(error, '简历模板加载失败'); }
  finally { starterLoading.value = false; }
};
const create = async () => {
  if (!form.name.trim() || !form.versionLabel.trim()) { ElMessage.warning('请填写名称和版本标签'); return; }
  try {
    const row = await resumeApi.save({...form});
    ElMessage.success('简历版本已创建');
    createVisible.value = false;
    await router.push(`/resumes/${row.id}/edit`);
  } catch (error) { showRequestError(error); }
};
const showUsage = async (row: ResumeVersion) => {
  try {
    usageResume.value = row;
    usageRows.value = (await postingApi.list({resumeVersionId: row.id, size: 100})).result;
    usageVisible.value = true;
  } catch (error) { showRequestError(error, '简历使用记录加载失败'); }
};
const archive = async (row: ResumeVersion) => {
  if (archivingId.value) return;
  archivingId.value = row.id;
  try {
    await resumeApi.archive(row.id);
    rows.value = rows.value.filter(item => item.id !== row.id);
    ElMessage.success('已归档，可从已投递 JD 查看该简历');
  } catch (error) { showRequestError(error, '归档失败'); }
  finally { archivingId.value = undefined; }
};
onMounted(load);
onBeforeUnmount(() => notesObserver.disconnect());
</script>

<template>
  <section class="page-stack">
    <div class="page-toolbar">
      <div><strong>Markdown 简历版本</strong><span class="toolbar-note">点击卡片进入编辑；内容存储、页面排版、PDF 输出统一管理</span></div>
      <el-button type="primary" :loading="starterLoading" @click="openCreate">新增版本</el-button>
    </div>
    <div class="card-grid">
      <article v-for="row in rows" :key="row.id" class="resource-card resume-card" tabindex="0" @click="router.push(`/resumes/${row.id}/edit`)" @keydown.enter="router.push(`/resumes/${row.id}/edit`)">
        <div class="resource-card__head"><el-tag :type="row.type === 'MASTER' ? 'warning' : 'success'">{{ labelOf(resumeTypeOptions, row.type) }}</el-tag><el-tag :type="row.active ? 'success' : 'info'" effect="plain">{{ row.active ? '启用' : '停用' }}</el-tag></div>
        <h3>{{ row.name }}</h3>
        <p class="version-label">{{ row.versionLabel }}</p>
        <div class="content-state" :class="{ready: row.contentReady}">{{ row.contentReady ? `Markdown 已就绪 · ${row.blockCount} 块` : '等待迁移 Markdown' }}</div>
        <div class="resume-description" @click.stop @keydown.enter.stop>
          <p :id="`resume-notes-${row.id}`" :ref="element => observeNotes(row.id, element)"
             :data-resume-id="row.id" class="resource-notes"
             :class="{'is-expanded': expandedNotes.has(row.id), 'is-truncated': overflowingNotes.has(row.id) && !expandedNotes.has(row.id)}"
             :tabindex="expandedNotes.has(row.id) ? 0 : undefined">{{ row.notes || '暂无版本说明' }}</p>
          <el-button v-if="overflowingNotes.has(row.id) || expandedNotes.has(row.id)" link type="primary"
                     :aria-expanded="expandedNotes.has(row.id)" :aria-controls="`resume-notes-${row.id}`"
                     @click="toggleNotes(row.id)">{{ expandedNotes.has(row.id) ? '收缩' : '查看' }}</el-button>
        </div>
        <div class="card-actions">
          <el-button link @click.stop="showUsage(row)">使用记录</el-button>
          <el-button link @click.stop="router.push(`/resumes/${row.id}/view`)">查看简历</el-button>
          <el-button link type="primary" @click.stop="router.push(`/resumes/${row.id}/edit`)">编辑内容</el-button>
          <el-button link :loading="archivingId === row.id" :disabled="archivingId !== undefined" @click.stop="archive(row)" @keydown.enter.stop>归档</el-button>
        </div>
      </article>
      <div v-if="!loading && rows.length === 0" class="empty-card">还没有简历版本，先创建 Markdown 标准版。</div>
    </div>

    <el-dialog v-model="createVisible" title="新增 Markdown 简历" width="720px">
      <el-form label-position="top" class="form-grid two-columns">
        <el-form-item label="版本名称" required><el-input v-model="form.name" placeholder="例如 Java 后端版" /></el-form-item>
        <el-form-item label="版本类型" required><el-select v-model="form.type"><el-option v-for="item in resumeTypeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="版本标签" required><el-input v-model="form.versionLabel" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.active" /></el-form-item>
        <el-form-item label="版本说明" class="full-span"><el-input v-model="form.notes" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="create">创建并编辑</el-button></template>
    </el-dialog>

    <el-drawer v-model="usageVisible" :title="`使用记录：${usageResume?.name || ''}`" size="560px">
      <el-table :data="usageRows" stripe empty-text="尚未用于任何投递">
        <el-table-column label="公司 / 岗位" min-width="230"><template #default="{row}"><strong>{{ row.title }}</strong><div class="cell-subtitle">{{ row.companyName }}</div></template></el-table-column>
        <el-table-column label="阶段" width="100"><template #default="{row}">{{ labelOf(stageOptions, row.stage) }}</template></el-table-column>
        <el-table-column label="投递时间" width="150"><template #default="{row}">{{ row.appliedAt?.replace('T', ' ').slice(0, 16) || '-' }}</template></el-table-column>
      </el-table>
    </el-drawer>
  </section>
</template>

<style scoped>
.card-grid { align-items: start; }
.resume-card { cursor: pointer; transition: transform .16s ease, box-shadow .16s ease; }
.resume-card:hover, .resume-card:focus-visible { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(23, 50, 42, .12); outline: none; }
.content-state { padding: 10px 12px; border-radius: 10px; color: #8b5a12; background: #fff4dc; font-size: 13px; }
.content-state.ready { color: #246246; background: #edf8f1; }
.resume-description { margin-top: 12px; cursor: default; }
.resume-description .resource-notes { margin: 0; max-height: 120px; overflow: hidden; white-space: pre-line; overflow-wrap: anywhere; }
.resume-description .resource-notes.is-truncated { mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent); }
.resume-description .resource-notes.is-expanded { max-height: 320px; overflow-y: auto; }
.resume-description .el-button { margin-top: 6px; }
.card-actions { margin-top: auto; }
</style>
