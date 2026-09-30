<script setup lang="ts">
import type {ResumeVersion} from '@/common/model/domain';
import {showRequestError} from '@/common/utils/error';
import {resumeApi} from '@/resume/api/resumeApi';
import ResumePaper from '@/resume/components/ResumePaper.vue';
import {onMounted, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';

const route = useRoute();
const router = useRouter();
const row = ref<ResumeVersion>();
const loading = ref(true);
const printPdf = () => window.print();
onMounted(async () => {
  try { row.value = await resumeApi.get(Number(route.params.id)); }
  catch (error) { showRequestError(error, '简历加载失败'); }
  finally { loading.value = false; }
});
</script>

<template>
  <section v-loading="loading" class="resume-view-page">
    <div class="resume-view-toolbar no-print">
      <el-button @click="router.push('/resumes')">返回版本</el-button>
      <el-button @click="router.push(`/resumes/${route.params.id}/edit`)">编辑</el-button>
      <div class="toolbar-spacer" />
      <span>打印时请选择 A4、边距无、开启背景图形</span>
      <el-button type="primary" :disabled="!row?.contentReady" @click="printPdf">下载 PDF</el-button>
    </div>
    <ResumePaper v-if="row" :markdown="row.contentMarkdown || ''" :photo-url="row.photoUrl" />
  </section>
</template>

<style scoped>
.resume-view-page { padding: 20px; background: #e9eef2; }
.resume-view-toolbar { max-width: 210mm; margin: 0 auto 18px; display: flex; align-items: center; gap: 10px; }
.resume-view-toolbar span { color: #6f7d75; font-size: 13px; }
.toolbar-spacer { flex: 1; }
@media print { .no-print { display: none !important; } .resume-view-page { padding: 0; background: #fff; } }
</style>
