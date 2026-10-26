<script setup lang="ts">
import type {DashboardPlanItem, Interview, InterviewSave, Posting, Stage, StageEvent} from '@/common/model/domain';
import {interviewFormatOptions, interviewStatusOptions, interviewTypeOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import {interviewApi} from '@/interview/api/interviewApi';
import {pipelineApi} from '@/pipeline/api/pipelineApi';
import {postingApi} from '@/posting/api/postingApi';
import {ElMessage} from 'element-plus';
import {computed, reactive, ref, watch} from 'vue';

const props = defineProps<{item: DashboardPlanItem}>();
const emit = defineEmits<{close: []; saved: []}>();
const loading = ref(false);
const saving = ref(false);
const failed = ref(false);
const posting = ref<Posting>();
const interviews = ref<Interview[]>([]);
const events = ref<StageEvent[]>([]);
const mode = ref<'advance' | 'edit'>('advance');
const result = ref<Stage | 'COMPLETE_INTERVIEW'>('INTERVIEW');
const terminal = computed(() => !!posting.value && ['REJECTED', 'ACCEPTED', 'WITHDRAWN', 'CLOSED'].includes(posting.value.stage));
const currentInterview = computed(() => interviews.value.find(i => i.id === props.item.interviewId));
const pendingInterview = computed(() => interviews.value.find(i => i.status === 'SCHEDULED'));
const currentEvent = computed(() => events.value.find(e => `stage-${e.id}` === props.item.id));
const edit = reactive({at: '', note: '', action: ''});
const schedule = reactive({scheduledAt: '', type: 'TECHNICAL' as InterviewSave['type'], format: 'ONLINE' as InterviewSave['format'], note: ''});
const interviewForm = reactive<InterviewSave>({roundNo: 1, type: 'TECHNICAL', format: 'ONLINE', scheduledAt: '', status: 'SCHEDULED'});
const options = computed(() => {
  if (terminal.value) return [];
  if (posting.value?.stage === 'OFFER') return [{value: 'ACCEPTED', label: '接受 Offer'}, {value: 'WITHDRAWN', label: '放弃 Offer'}];
  const choices = [{value: 'INTERVIEW', label: interviews.value.length ? '安排下一轮面试' : '面试', disabled: !!pendingInterview.value},
    {value: 'REJECTED', label: '被拒'}];
  if (pendingInterview.value) choices.unshift({value: 'COMPLETE_INTERVIEW', label: '面试已完成', disabled: false});
  if (posting.value?.stage === 'INTERVIEW') choices.push({value: 'OFFER', label: '收到 Offer'});
  return choices;
});

const load = async () => {
  loading.value = true; failed.value = false;
  try {
    const [p, list, history] = await Promise.all([postingApi.get(props.item.postingId),
      interviewApi.list({postingId: props.item.postingId}), pipelineApi.events(props.item.postingId)]);
    posting.value = p; interviews.value = list; events.value = history;
    mode.value = terminal.value ? 'edit' : 'advance';
    result.value = p.stage === 'OFFER' ? 'ACCEPTED' : pendingInterview.value ? 'COMPLETE_INTERVIEW' : 'INTERVIEW';
    edit.at = props.item.kind === 'APPLICATION' ? p.appliedAt ?? '' : props.item.scheduledAt ?? '';
    edit.note = currentEvent.value?.note ?? props.item.description ?? '';
    edit.action = p.nextAction ?? '';
    if (currentInterview.value) Object.assign(interviewForm, currentInterview.value);
  } catch (error) { failed.value = true; showRequestError(error, '进度加载失败'); }
  finally { loading.value = false; }
};
watch(() => props.item.id, load, {immediate: true});

const interviewData = (i: Interview): InterviewSave => ({roundNo: i.roundNo, type: i.type, format: i.format,
  scheduledAt: i.scheduledAt, status: i.status, interviewer: i.interviewer, questions: i.questions,
  feedback: i.feedback, nextStep: i.nextStep});
const save = async () => {
  if (!posting.value || saving.value || failed.value) return;
  const p = posting.value;
  if (mode.value === 'advance' && result.value === 'INTERVIEW' && !schedule.scheduledAt) {
    ElMessage.warning('请填写面试时间'); return;
  }
  if (mode.value === 'edit' && !(props.item.kind === 'INTERVIEW' ? interviewForm.scheduledAt : edit.at)) {
    ElMessage.warning('请填写记录时间'); return;
  }
  saving.value = true;
  try {
    if (mode.value === 'advance') {
      if (result.value === 'INTERVIEW') {
        await interviewApi.schedule(p.id, {expectedStage: p.stage, ...schedule});
      } else if (result.value === 'COMPLETE_INTERVIEW' && pendingInterview.value) {
        await interviewApi.save(p.id, {...interviewData(pendingInterview.value), status: 'COMPLETED',
          feedback: schedule.note || pendingInterview.value.feedback}, pendingInterview.value.id);
      } else {
        await pipelineApi.recordResult(p.id, {expectedStage: p.stage, result: result.value as Stage, note: schedule.note});
      }
    } else if (props.item.kind === 'APPLICATION' && p.appliedAt) {
      await pipelineApi.updateApplicationDate(p.id, p.appliedAt, edit.at);
    } else if (props.item.kind === 'INTERVIEW' && currentInterview.value) {
      const {roundNo, type, format, scheduledAt, status, interviewer, questions, feedback, nextStep} = interviewForm;
      await interviewApi.save(p.id, {roundNo, type, format, scheduledAt, status, interviewer, questions, feedback, nextStep}, currentInterview.value.id);
    } else if (props.item.kind === 'STAGE' && currentEvent.value) {
      await pipelineApi.updateEvent(p.id, currentEvent.value.id, currentEvent.value.occurredAt, edit.at, edit.note);
    } else if (props.item.kind === 'FOLLOW_UP') {
      if (!edit.action.trim()) { ElMessage.warning('请填写跟进动作'); return; }
      await pipelineApi.changeStage(p.id, {toStage: p.stage, nextAction: edit.action, nextActionAt: edit.at});
    } else { throw new Error('记录已变化，请关闭后重新打开'); }
    ElMessage.success('进度已保存'); emit('saved'); emit('close');
  } catch (error) { showRequestError(error, '进度保存失败'); }
  finally { saving.value = false; }
};
</script>

<template>
  <el-dialog :model-value="true" title="更新求职进度" width="min(640px, 94vw)"
    :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @close="emit('close')">
    <div v-loading="loading" class="progress-dialog-body">
      <h3>{{ item.companyName }} · {{ item.jobTitle }}</h3>
      <p class="cell-subtitle">{{ item.title }} · {{ item.scheduledAt?.replace('T', ' ').slice(0, 16) || '未设置时间' }}</p>
      <el-alert v-if="failed" title="加载失败，请重试后再操作" type="error" :closable="false"><el-button @click="load">重试</el-button></el-alert>
      <template v-else-if="posting && !loading">
        <el-radio-group v-model="mode" :disabled="saving" class="progress-modes">
          <el-radio-button v-if="!terminal" value="advance">下一步动作</el-radio-button>
          <el-radio-button value="edit">修改本条记录</el-radio-button>
        </el-radio-group>
        <el-form label-position="top" :disabled="saving">
          <template v-if="mode === 'advance'">
            <el-form-item label="下一步动作" required>
              <el-radio-group v-model="result"><el-radio-button v-for="option in options" :key="option.value"
                :value="option.value" :disabled="option.disabled">{{ option.label }}</el-radio-button></el-radio-group>
            </el-form-item>
            <p v-if="pendingInterview" class="cell-subtitle">已有第 {{ pendingInterview.roundNo }} 轮面试，完成后可安排下一轮；点击对应面试节点可改期或复盘。</p>
            <template v-if="result === 'INTERVIEW'">
              <el-form-item label="面试时间" required><el-date-picker v-model="schedule.scheduledAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择已约定的面试时间" /></el-form-item>
              <div class="form-grid two-columns">
                <el-form-item label="面试类型"><el-select v-model="schedule.type"><el-option v-for="option in interviewTypeOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
                <el-form-item label="面试形式"><el-select v-model="schedule.format"><el-option v-for="option in interviewFormatOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
              </div>
            </template>
            <el-form-item :label="result === 'REJECTED' ? '拒绝原因（可选）' : '备注 / 反馈（可选）'"><el-input v-model="schedule.note" type="textarea" :rows="3" maxlength="500" /></el-form-item>
          </template>
          <template v-else-if="item.kind === 'INTERVIEW' && currentInterview">
            <el-form-item label="面试时间" required><el-date-picker v-model="interviewForm.scheduledAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
            <div class="form-grid two-columns">
              <el-form-item label="面试类型"><el-select v-model="interviewForm.type"><el-option v-for="option in interviewTypeOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
              <el-form-item label="面试形式"><el-select v-model="interviewForm.format"><el-option v-for="option in interviewFormatOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
            </div>
            <el-form-item label="面试状态"><el-select v-model="interviewForm.status"><el-option v-for="option in interviewStatusOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
            <el-form-item label="面试官"><el-input v-model="interviewForm.interviewer" /></el-form-item>
            <el-form-item label="面试问题"><el-input v-model="interviewForm.questions" type="textarea" :rows="3" /></el-form-item>
            <el-form-item label="表现与反馈"><el-input v-model="interviewForm.feedback" type="textarea" :rows="3" /></el-form-item>
            <el-form-item label="下一步 / 改进项"><el-input v-model="interviewForm.nextStep" type="textarea" :rows="2" /></el-form-item>
          </template>
          <template v-else>
            <el-form-item :label="item.kind === 'APPLICATION' ? '投递时间' : '记录时间'" required><el-date-picker v-model="edit.at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
            <el-form-item v-if="item.kind === 'FOLLOW_UP'" label="跟进动作" required><el-input v-model="edit.action" maxlength="500" /></el-form-item>
            <el-form-item v-if="item.kind === 'STAGE'" label="备注"><el-input v-model="edit.note" type="textarea" :rows="3" maxlength="1000" /></el-form-item>
          </template>
        </el-form>
      </template>
    </div>
    <template #footer><el-button :disabled="saving" @click="emit('close')">关闭</el-button><el-button type="primary" :loading="saving" :disabled="loading || failed || !posting" @click="save">保存进度</el-button></template>
  </el-dialog>
</template>

<style scoped>
.progress-dialog-body {min-height:150px;}
.progress-dialog-body h3 {margin-top:0;overflow-wrap:anywhere;}
.progress-modes {margin:12px 0 20px;}
.el-radio-group {gap:6px;flex-wrap:wrap;}
.el-date-editor.el-input {width:100%;}
</style>
