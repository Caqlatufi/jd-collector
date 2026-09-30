<script setup lang="ts">
import type {PostingKnowledgeOption, TermPriority} from '@/common/model/domain';
import {showRequestError} from '@/common/utils/error';
import {postingKnowledgeApi} from '@/posting/api/postingKnowledgeApi';
import {ElMessage} from 'element-plus';
import {reactive, ref, watch} from 'vue';

const props = defineProps<{posting?: PostingKnowledgeOption}>();
const emit = defineEmits<{saved: []}>();
const loading = ref(false);
const saving = ref(false);
const state = reactive<{processed: boolean; stale: boolean; high: string[]; medium: string[]; low: string[]}>({
  processed: false, stale: false, high: [], medium: [], low: [],
});

const load = async () => {
  if (!props.posting) return;
  loading.value = true;
  try {
    const result = await postingKnowledgeApi.terms(props.posting.postingId);
    state.processed = result.processed;
    state.stale = result.stale;
    state.high = result.terms.filter(term => term.priority === 'HIGH').map(term => term.term);
    state.medium = result.terms.filter(term => term.priority === 'MEDIUM').map(term => term.term);
    state.low = result.terms.filter(term => term.priority === 'LOW').map(term => term.term);
  } catch (error) { showRequestError(error, '知识词加载失败'); }
  finally { loading.value = false; }
};

const save = async () => {
  if (!props.posting) return;
  const seen = new Set<string>();
  const terms: {term: string; priority: TermPriority}[] = [];
  for (const [priority, values] of [['HIGH', state.high], ['MEDIUM', state.medium], ['LOW', state.low]] as const) {
    for (const raw of values) {
      const term = raw.trim();
      const key = term.normalize('NFKC').toLowerCase().replaceAll(/\s+/g, '');
      if (!term || seen.has(key)) continue;
      seen.add(key);
      terms.push({term, priority});
    }
  }
  if (terms.length > 30) { ElMessage.warning('每条JD最多保存30个不同知识词'); return; }
  saving.value = true;
  try {
    await postingKnowledgeApi.replaceTerms(props.posting.postingId, {extractorVersion: 'manual-v1', terms});
    ElMessage.success('知识词已保存');
    await load();
    emit('saved');
  } catch (error) { showRequestError(error, '知识词保存失败'); }
  finally { saving.value = false; }
};

watch(() => props.posting?.postingId, load, {immediate: true});
</script>

<template>
  <div v-loading="loading" class="term-editor">
    <el-alert v-if="!state.processed" title="这条JD尚未拆词，保存后会建立知识词档案。" type="warning" :closable="false" />
    <el-alert v-else-if="state.stale" title="JD内容已经变化，当前词集已过期；请核对后重新保存。" type="warning" :closable="false" />
    <p class="term-editor__hint">同一个词跨档重复时保留最高档；总计最多30个词。</p>
    <el-form label-position="top">
      <el-form-item label="高优先级 · 权重3">
        <el-select v-model="state.high" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="核心职责或硬性能力" />
      </el-form-item>
      <el-form-item label="中优先级 · 权重2">
        <el-select v-model="state.medium" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="重要支撑能力" />
      </el-form-item>
      <el-form-item label="低优先级 · 权重1">
        <el-select v-model="state.low" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="加分项或领域知识" />
      </el-form-item>
    </el-form>
    <div class="term-editor__actions"><el-button type="primary" :loading="saving" @click="save">保存三档知识词</el-button></div>
  </div>
</template>

<style scoped>
.term-editor__hint {color:#77827c;font-size:13px;}
.term-editor :deep(.el-select) {width:100%;}
.term-editor__actions {display:flex;justify-content:flex-end;}
</style>
