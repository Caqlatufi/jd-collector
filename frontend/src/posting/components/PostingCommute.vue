<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import {ElMessage} from 'element-plus';
import type {Posting} from '@/common/model/domain';
import {commuteSummary} from '@/common/utils/commute';
import {showRequestError} from '@/common/utils/error';
import {postingApi} from '@/posting/api/postingApi';

const props = defineProps<{posting: Posting}>();
const emit = defineEmits<{saved: [posting: Posting]}>();
const summary = computed(() => commuteSummary(props.posting.riskNotes));
const visible = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const form = reactive<{minMinutes?: number; maxMinutes?: number; note: string; expectedRiskNotes: string}>({
  note: '', expectedRiskNotes: '',
});

const open = () => {
  const range = summary.value.estimate.match(/^(\d+)\s*(?:[–—-]\s*(\d+))?\s*分钟/);
  Object.assign(form, {
    minMinutes: range ? Number(range[1]) : undefined,
    maxMinutes: range ? Number(range[2] ?? range[1]) : undefined,
    note: summary.value.note,
    expectedRiskNotes: props.posting.riskNotes ?? '',
  });
  errorMessage.value = '';
  visible.value = true;
};

const save = async () => {
  if (saving.value) return;
  errorMessage.value = '';
  if (form.minMinutes == null || form.maxMinutes == null) {
    errorMessage.value = '请填写时间下限和上限';
    return;
  }
  if (![form.minMinutes, form.maxMinutes].every(value => Number.isInteger(value) && value >= 0 && value <= 1440)) {
    errorMessage.value = '请填写 0–1440 之间的整数分钟';
    return;
  }
  if (form.minMinutes > form.maxMinutes) {
    errorMessage.value = '时间下限不能大于上限';
    return;
  }
  saving.value = true;
  try {
    const updated = await postingApi.saveCommute(props.posting.id, {
      minMinutes: form.minMinutes, maxMinutes: form.maxMinutes, note: form.note.trim(),
      expectedRiskNotes: form.expectedRiskNotes,
    });
    emit('saved', updated);
    visible.value = false;
    ElMessage.success(`通勤时间已保存，通勤 ${updated.commuteScore}/15，总分 ${updated.totalScore}/100`);
  } catch (error) {
    showRequestError(error, '通勤时间保存失败');
  } finally { saving.value = false; }
};
</script>

<template>
  <div class="commute-cell">
    <div class="commute-estimate">{{ summary.estimate }}</div>
    <div v-if="summary.note" class="commute-note cell-subtitle">{{ summary.note }}</div>
    <el-button link type="primary" size="small" @click="open">
      {{ summary.hasEstimate ? '修改时间范围' : '填写时间范围' }}
    </el-button>
  </div>
  <el-dialog v-model="visible" title="填写通勤时间范围" width="min(460px, 94vw)" append-to-body
    :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
    <p>{{ posting.companyName }} · {{ posting.title }}</p>
    <el-form label-position="top" @submit.prevent="save">
      <div class="commute-range">
        <el-form-item label="时间下限（分钟）" required>
          <el-input-number v-model="form.minMinutes" aria-label="时间下限（分钟）" :min="0" :max="1440"
            :precision="0" :disabled="saving" placeholder="例如 45" />
        </el-form-item>
        <el-form-item label="时间上限（分钟）" required>
          <el-input-number v-model="form.maxMinutes" aria-label="时间上限（分钟）" :min="0" :max="1440"
            :precision="0" :disabled="saving" placeholder="例如 60" />
        </el-form-item>
      </div>
      <p class="cell-subtitle commute-rule">提交后按时间上限重算通勤分：≤30分钟15分，≤45分钟12分，≤60分钟10分，超过60分钟0分；同步更新总分和自动等级。</p>
      <el-form-item label="备注（选填）">
        <el-input v-model="form.note" aria-label="通勤备注" :maxlength="300" :disabled="saving"
          placeholder="例如：电动车，含停车和步行" />
      </el-form-item>
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" />
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">提交</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.commute-estimate { font-weight: 600; }
.commute-range { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.commute-range .el-input-number { width: 100%; }
.commute-rule { margin: 0 0 16px; }
</style>
