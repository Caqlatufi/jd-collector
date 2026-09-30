<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import {ElMessage, ElMessageBox} from 'element-plus';
import {criteriaApi} from '../api/criteriaApi';
import ChoiceQuestion from '../components/ChoiceQuestion.vue';
import type {CriteriaDocument, CriteriaResponse, Criterion} from '../model';

const document = ref<CriteriaDocument>();
const revision = ref('');
const baseline = ref('');
const busy = ref(false);
const error = ref('');
const activeGroup = ref('salary');
const savedAt = ref('');
const fields = computed(() => document.value?.sections.flatMap(section => section.fields) ?? []);
const dirty = computed(() => !!document.value && JSON.stringify(document.value) !== baseline.value);
const filledCount = computed(() => fields.value.filter(field => field.value?.trim()).length);
const selected = computed(() => document.value?.sections.find(section => section.id === activeGroup.value));

function accept(response: CriteriaResponse) {
  document.value = response.document;
  revision.value = response.revision;
  baseline.value = JSON.stringify(response.document);
  if (!response.document.sections.some(section => section.id === activeGroup.value)) {
    activeGroup.value = response.document.sections[0]?.id ?? '';
  }
}

async function mayDiscard(): Promise<boolean> {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('还有未保存的答案，离开或重新加载会丢弃修改。', '离开填写页？', {
      confirmButtonText: '放弃修改', cancelButtonText: '继续填写', type: 'warning',
    });
    return true;
  } catch {
    return false;
  }
}

async function load() {
  if (busy.value || !(await mayDiscard())) return;
  busy.value = true;
  error.value = '';
  try {
    accept(await criteriaApi.get());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败，请重试。';
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!document.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const answers = fields.value.map(({id, value, kind}) => ({
      id, value: value?.trim() || null, kind,
      status: value?.trim() ? 'CONFIRMED' as const : 'PENDING' as const,
    }));
    accept(await criteriaApi.save(revision.value, answers));
    savedAt.value = new Date().toLocaleTimeString('zh-CN', {hour12: false});
    ElMessage.success('已保存，之后按这些答案筛选');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败，答案已保留。';
  } finally {
    busy.value = false;
  }
}

function edit(field: Criterion, value: string | null) {
  field.value = value;
  field.status = 'PENDING';
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}

onBeforeRouteLeave(async () => !busy.value && await mayDiscard());
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  void load();
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <section class="criteria-page" v-loading="busy">
    <div class="intro">
      <div>
        <h2>选一选，你想找什么样的工作</h2>
        <p>不确定可先留空，每题都能填写“其他”。点保存即可，无需逐项确认。</p>
      </div>
      <span v-if="document" class="progress">已填 {{ filledCount }} / {{ fields.length }}</span>
    </div>
    <details v-if="document?.baselineRules?.length" class="baseline">
      <summary>已知前提保留，无需重复填写</summary>
      <p v-for="rule in document.baselineRules" :key="rule.id">{{ rule.label }}：{{ rule.value }}</p>
      <p>如需调整这些前提，可在“其他偏好 → 还有其他要求吗？”中填写。</p>
    </details>

    <el-alert v-if="error" class="error-box" :title="error" type="error" :closable="false" show-icon />
    <div v-if="!document && !busy">
      <p>加载失败，不会用空白内容覆盖原文件。</p>
      <el-button @click="load">重新加载</el-button>
    </div>
    <template v-if="document">
      <nav class="group-nav" aria-label="门槛分组">
        <button v-for="section in document.sections" :key="section.id" type="button"
                :class="{active: activeGroup === section.id}" :aria-pressed="activeGroup === section.id"
                @click="activeGroup = section.id">{{ section.title }}</button>
      </nav>
      <section v-if="selected" class="group-panel" :aria-label="selected.title">
        <h3>{{ selected.title }}</h3>
        <el-form :disabled="busy" @submit.prevent="save">
          <fieldset class="questions" :disabled="busy">
            <ChoiceQuestion v-for="field in selected.fields" :key="field.id" :field="field"
                            @change="value => edit(field, value)" />
          </fieldset>
        </el-form>
      </section>
      <footer class="save-bar">
        <div>
          <strong>{{ dirty ? '有修改尚未保存' : '答案已保留' }}</strong>
          <small>{{ savedAt ? '最近保存 ' + savedAt : '保存即采用已填答案；不会自动投递或修改 JD' }}</small>
        </div>
        <div class="save-actions">
          <el-button :disabled="busy" @click="load">重新加载</el-button>
          <el-button type="primary" :disabled="busy" @click="save">保存门槛</el-button>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped lang="scss">
.criteria-page { max-width: 1100px; margin: 0 auto; color: #233c32; }
.intro {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  h2 { margin: 0 0 12px; font-size: 24px; }
  p { color: #718075; font-size: 14px; line-height: 1.7; margin: 0; }
}
.progress { white-space: nowrap; color: #738477; font-size: 14px; }
.baseline {
  margin: 18px 0; color: #78877b; font-size: 13px;
  summary { cursor: pointer; }
  p { line-height: 1.8; }
}
.error-box { margin: 18px 0; }
.group-nav {
  display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0;
  button {
    border: 1px solid #d8e2da; border-radius: 9px; padding: 11px 18px;
    background: #fff; color: #4c6356; cursor: pointer; font: inherit;
    &.active { color: #fff; background: #284d3e; border-color: #284d3e; }
    &:focus-visible { outline: 3px solid #f5b855; outline-offset: 2px; }
  }
}
.group-panel {
  padding: 24px 28px; background: #fff; border: 1px solid #e0e6dd; border-radius: 16px;
  h3 { margin: 0 0 24px; font-size: 20px; }
}
.questions { padding: 0; margin: 0; border: 0; min-width: 0; }
.save-bar {
  position: sticky; bottom: 12px; z-index: 5; display: flex; align-items: center; justify-content: space-between;
  gap: 16px; background: #1d392e; color: #fff; padding: 18px 22px; margin-top: 20px; border-radius: 14px;
  box-shadow: 0 8px 28px #102d2820;
  small { display: block; margin-top: 6px; color: #b9cdc0; font-size: 12px; }
  .save-actions { display: flex; flex-shrink: 0; }
}
@media (max-width: 850px) {
  .intro { align-items: flex-start; flex-direction: column; gap: 8px; }
  .group-panel { padding: 22px; }
  .save-bar { padding: 16px; }
}
</style>
