<script setup lang="ts">
import type {ResumeSave, ResumeVersion} from '@/common/model/domain';
import {resumeTypeOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import ResumePaper from '@/resume/components/ResumePaper.vue';
import {resumeApi} from '@/resume/api/resumeApi';
import {ElMessage, ElMessageBox} from 'element-plus';
import {computed, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue';
import {onBeforeRouteLeave, useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));
const loading = ref(true);
const saving = ref(false);
const dirty = ref(false);
const blockCount = ref(0);
const form = reactive<ResumeSave>({
  name: '', type: 'MASTER', versionLabel: '', contentMarkdown: '', templateKey: 'CLASSIC_BLUE',
  photoUrl: '', active: true, notes: '',
});

const load = async () => {
  loading.value = true;
  try {
    const row: ResumeVersion = await resumeApi.get(id.value);
    Object.assign(form, {
      name: row.name, type: row.type, versionLabel: row.versionLabel,
      contentMarkdown: row.contentMarkdown || '', templateKey: row.templateKey || 'CLASSIC_BLUE',
      photoUrl: row.photoUrl || '', active: row.active, notes: row.notes || '',
    });
    blockCount.value = row.blockCount;
    dirty.value = false;
  } catch (error) { showRequestError(error, '简历加载失败'); }
  finally { loading.value = false; }
};

const save = async () => {
  if (!form.name.trim() || !form.versionLabel.trim() || !form.contentMarkdown.trim()) {
    ElMessage.warning('请填写版本名称、标签和 Markdown 正文'); return;
  }
  saving.value = true;
  try {
    const row = await resumeApi.save({...form}, id.value);
    blockCount.value = row.blockCount;
    dirty.value = false;
    ElMessage.success(`简历已保存，并生成 ${row.blockCount} 个内容块`);
  } catch (error) { showRequestError(error); }
  finally { saving.value = false; }
};
const printPdf = () => window.print();

const beforeUnload = (event: BeforeUnloadEvent) => {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
};

watch(form, () => { if (!loading.value) dirty.value = true; }, {deep: true});
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); load(); });
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('简历还有未保存修改，确定离开吗？', '未保存修改', {type: 'warning'});
    return true;
  } catch { return false; }
});
</script>

<template>
  <section v-loading="loading" class="resume-editor-page">
    <div class="resume-editor-toolbar no-print">
      <el-button @click="router.push('/resumes')">返回版本</el-button>
      <span class="editor-state">{{ dirty ? '有未保存修改' : `已保存 · ${blockCount} 个内容块` }}</span>
      <div class="toolbar-spacer" />
      <el-button @click="router.push(`/resumes/${id}/view`)">独立预览</el-button>
      <el-button @click="printPdf">下载 PDF</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存简历</el-button>
    </div>

    <div class="resume-meta no-print">
      <el-form label-position="top" class="form-grid four-columns">
        <el-form-item label="版本名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="form.type"><el-option v-for="item in resumeTypeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="版本标签"><el-input v-model="form.versionLabel" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.active" /></el-form-item>
        <el-form-item label="照片站内路径"><el-input v-model="form.photoUrl" placeholder="/resume/photo.png" /></el-form-item>
        <el-form-item label="版本说明" class="span-three"><el-input v-model="form.notes" /></el-form-item>
      </el-form>
    </div>

    <div class="resume-editor-grid">
      <section class="markdown-panel no-print">
        <header><strong>Markdown 正文</strong><small>H1 姓名 · H2 区块 · H3 公司 · H4 项目</small></header>
        <el-input v-model="form.contentMarkdown" type="textarea" resize="none" spellcheck="false" />
      </section>
      <section class="preview-panel">
        <ResumePaper :markdown="form.contentMarkdown" :photo-url="form.photoUrl" />
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
.resume-editor-page { display: grid; gap: 18px; }
.resume-editor-toolbar { display: flex; align-items: center; gap: 12px; }
.editor-state { color: #728078; }
.toolbar-spacer { flex: 1; }
.resume-meta { padding: 18px; border: 1px solid #e0e5df; border-radius: 16px; background: #fff; }
.four-columns { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.span-three { grid-column: span 3; }
.resume-editor-grid { display: grid; grid-template-columns: minmax(360px, .8fr) minmax(760px, 1.2fr); gap: 20px; align-items: start; }
.markdown-panel { position: sticky; top: 12px; height: calc(100vh - 90px); border: 1px solid #dfe5df; border-radius: 16px; background: #fff; overflow: hidden; }
.markdown-panel header { height: 58px; padding: 12px 16px; display: flex; flex-direction: column; border-bottom: 1px solid #e4e9e4; }
.markdown-panel small { color: #89938d; }
.markdown-panel :deep(.el-textarea), .markdown-panel :deep(.el-textarea__inner) { height: calc(100% - 29px); }
.markdown-panel :deep(.el-textarea__inner) { border: 0; border-radius: 0; box-shadow: none; font: 13px/1.65 Consolas, "Microsoft YaHei", monospace; }
.preview-panel { padding: 18px; overflow-x: auto; border-radius: 18px; background: #e9eef2; }
@media (max-width: 1180px) { .resume-editor-grid { grid-template-columns: 1fr; } .markdown-panel { position: static; height: 560px; } }
@media print { .no-print { display: none !important; } .resume-editor-page, .resume-editor-grid, .preview-panel { display: block; padding: 0; margin: 0; background: #fff; } }
</style>
