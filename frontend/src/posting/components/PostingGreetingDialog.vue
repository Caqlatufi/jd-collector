<script setup lang="ts">
import type {Posting, ResumeVersion} from '@/common/model/domain';
import {showRequestError} from '@/common/utils/error';
import {postingApi} from '@/posting/api/postingApi';
import type {GreetingResult} from '@/posting/api/postingApi';
import {resumeApi} from '@/resume/api/resumeApi';
import {ElMessage} from 'element-plus';
import {computed, onBeforeUnmount, ref, watch} from 'vue';

const props = defineProps<{modelValue: boolean; posting?: Posting; canMarkSent?: boolean; markingSent?: boolean}>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'message-sent'): void;
}>();
const visible = computed({get: () => props.modelValue, set: value => emit('update:modelValue', value)});
const resumes = ref<ResumeVersion[]>([]);
const resumeId = ref<number>();
const loadingResumes = ref(false);
const generating = ref(false);
const loadingGreeting = ref(false);
const copying = ref(false);
const text = ref('');
const result = ref<GreetingResult>();
const generationError = ref('');
const historyError = ref('');
let epoch = 0;
let historyRequest = 0;
const characterCount = computed(() => Array.from(text.value.replace(/[\p{White_Space}\uFEFF]/gu, '')).length);
const validLength = computed(() => characterCount.value >= 100);
const busy = computed(() => loadingResumes.value || loadingGreeting.value || generating.value || props.markingSent);
const canGenerate = computed(() => resumes.value.some(item => item.id === resumeId.value));
const unavailableResume = computed(() => result.value && !resumes.value.some(item => item.id === result.value?.resumeVersionId)
  ? result.value : undefined);

const restore = (draft: GreetingResult | null, postingId: number, selectedResume?: number) => {
  if (!draft) return;
  if (draft.postingId !== postingId || (selectedResume !== undefined && draft.resumeVersionId !== selectedResume)) {
    throw new Error('已保存用语与当前岗位或简历不一致，请重试读取');
  }
  resumeId.value = draft.resumeVersionId;
  result.value = draft;
  text.value = draft.greeting;
};

watch([() => props.modelValue, () => props.posting?.id], async () => {
  const token = ++epoch;
  historyRequest++;
  if (!props.modelValue) return;
  text.value = '';
  result.value = undefined;
  generationError.value = '';
  historyError.value = '';
  resumeId.value = undefined;
  resumes.value = [];
  loadingResumes.value = true;
  generating.value = false;
  loadingGreeting.value = false;
  const postingId = props.posting?.id;
  if (!postingId) { loadingResumes.value = false; return; }
  try {
    const [versions, saved] = await Promise.allSettled([
      resumeApi.list({active: true}), postingApi.latestGreeting(postingId),
    ]);
    if (token !== epoch) return;
    if (versions.status === 'fulfilled') {
      resumes.value = versions.value.filter(item => item.active && !item.archived && item.contentReady);
    } else showRequestError(versions.reason, '简历版本加载失败');
    if (props.posting?.resumeVersionId && resumes.value.some(item => item.id === props.posting?.resumeVersionId)) {
      resumeId.value = props.posting.resumeVersionId;
    }
    if (saved.status === 'fulfilled') restore(saved.value, postingId);
    else throw saved.reason;
  } catch (error) {
    if (token === epoch) historyError.value = error instanceof Error ? error.message : '已保存用语读取失败，请重试';
  } finally {
    if (token === epoch) loadingResumes.value = false;
  }
});

const loadSelectedGreeting = async () => {
  if (!props.posting) return;
  const token = epoch;
  const request = ++historyRequest;
  const postingId = props.posting.id;
  const selectedResume = resumeId.value;
  text.value = '';
  result.value = undefined;
  generationError.value = '';
  historyError.value = '';
  loadingGreeting.value = true;
  try {
    const saved = await postingApi.latestGreeting(postingId, selectedResume);
    if (token === epoch && request === historyRequest) restore(saved, postingId, selectedResume);
  } catch (error) {
    if (token === epoch && request === historyRequest) {
      historyError.value = error instanceof Error ? error.message : '已保存用语读取失败，请重试';
    }
  } finally {
    if (token === epoch && request === historyRequest) loadingGreeting.value = false;
  }
};
onBeforeUnmount(() => { epoch++; historyRequest++; });

const generate = async () => {
  if (!props.posting || !resumeId.value || !canGenerate.value || busy.value) return;
  const token = epoch;
  const postingId = props.posting.id;
  const selectedResume = resumeId.value;
  generationError.value = '';
  historyError.value = '';
  generating.value = true;
  try {
    const draft = await postingApi.greeting(postingId, selectedResume);
    if (token !== epoch) return;
    if (draft.postingId !== postingId || draft.resumeVersionId !== selectedResume) {
      throw new Error('结果与当前岗位或简历不一致，请重新生成');
    }
    result.value = draft;
    text.value = draft.greeting;
  } catch (error) {
    if (token === epoch) {
      generationError.value = error instanceof Error && error.message ? error.message : '打招呼用语生成失败，请重试';
    }
  } finally {
    if (token === epoch) generating.value = false;
  }
};

const copy = async () => {
  if (!validLength.value || busy.value) return;
  copying.value = true;
  try {
    await navigator.clipboard.writeText(text.value.trim());
    ElMessage.success('已复制打招呼用语');
  } catch {
    ElMessage.warning('复制失败，请在文本框中选中并手动复制');
  } finally { copying.value = false; }
};
</script>

<template>
  <el-dialog v-model="visible" title="打招呼" width="min(720px, 94vw)" align-center :close-on-click-modal="false"
    :close-on-press-escape="!busy" :show-close="!busy" destroy-on-close>
    <div class="greeting-stack">
      <div class="greeting-job">{{ posting?.companyName }} · {{ posting?.title }}</div>
      <div class="greeting-hint">逐行对照 JD 列出有真实经历支持的符合项，任职资格与加分项空行分隔，生成 100–500 字的首次沟通用语。</div>
      <el-form label-position="top">
        <el-form-item label="选择简历" required>
          <el-select v-model="resumeId" filterable :loading="loadingResumes" :disabled="busy"
            placeholder="选择本次沟通使用的简历" style="width: 100%" @change="loadSelectedGreeting">
            <el-option v-if="unavailableResume" :value="unavailableResume.resumeVersionId" disabled
              :label="`${unavailableResume.resumeName} · ${unavailableResume.versionLabel}（当前不可用）`" />
            <el-option v-for="item in resumes" :key="item.id" :value="item.id"
              :label="`${item.name} · ${item.versionLabel}`" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert v-if="!loadingResumes && !resumes.length" type="warning" :closable="false"
        title="暂无可用简历，请先启用一个有正文的简历版本。" />
      <div v-if="loadingResumes || loadingGreeting" class="greeting-hint" role="status">正在读取已保存用语和简历版本…</div>
      <el-alert v-if="historyError" :title="historyError" type="error" :closable="false" show-icon />
      <el-button v-if="historyError" :disabled="busy" @click="loadSelectedGreeting">重试读取已保存用语</el-button>
      <div class="greeting-controls">
        <span class="greeting-hint">GPT 6.1 Sol · medium</span>
        <el-button type="primary" :loading="generating" :disabled="!canGenerate || busy" @click="generate">
          {{ result ? '重新生成' : generationError ? '重试生成' : '生成打招呼用语' }}
        </el-button>
      </div>
      <div v-if="generating" class="greeting-hint" role="status">正在对照 JD 和简历提炼经历，通常需要几十秒，请稍候。</div>
      <el-alert v-if="generationError" :title="generationError" type="error" :closable="false" show-icon />
      <template v-if="result">
        <el-input v-model="text" type="textarea" :autosize="{minRows: 10, maxRows: 18}" :disabled="busy" aria-label="打招呼用语"
          placeholder="生成后可在这里调整措辞" />
        <div class="greeting-controls">
          <span class="greeting-hint">{{ result.resumeName }} · {{ result.versionLabel }}</span>
          <span :class="{'greeting-count-invalid': !validLength}">{{ characterCount }} 字（建议 100–500 字，含标点，不含空白）</span>
        </div>
        <div class="greeting-hint">生成结果已保存，重新打开可查看。文本框内的临时修改仅用于本次复制。</div>
        <el-collapse>
          <el-collapse-item title="生成时匹配依据" name="evidence">
            <div v-for="(item, index) in result.evidence" :key="index" class="greeting-evidence">
              <div><strong>JD：</strong>{{ item.jdQuote }}</div>
              <div><strong>简历：</strong>{{ item.resumeQuote }}</div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </template>
    </div>
    <template #footer>
      <el-button type="success" :loading="markingSent" :disabled="busy || !canMarkSent" @click="emit('message-sent')">已发送消息</el-button>
      <el-button :disabled="busy" @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="copying" :disabled="!result || !validLength || busy" @click="copy">
        复制用语
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.greeting-stack { display: flex; flex-direction: column; gap: 14px; }
.greeting-job { font-size: 17px; font-weight: 600; line-height: 1.5; }
.greeting-hint { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
.greeting-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.greeting-stack :deep(.el-form-item) { margin-bottom: 0; }
.greeting-count-invalid { color: var(--el-color-danger); }
.greeting-evidence { margin: 10px 0; line-height: 1.6; white-space: pre-wrap; }
</style>
