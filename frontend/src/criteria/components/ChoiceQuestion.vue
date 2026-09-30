<script setup lang="ts">
import {ref, watch} from 'vue';
import type {Criterion} from '../model';

const props = defineProps<{field: Criterion}>();
const emit = defineEmits<{change: [value: string | null]}>();
const mode = ref<string | null>(null);
const other = ref('');
const OTHER = '__other__';

watch(() => props.field, field => {
  const value = field.value;
  mode.value = value ? (field.options?.includes(value) ? value : OTHER) : null;
  other.value = mode.value === OTHER ? value ?? '' : '';
}, {immediate: true});

function select(value: string) {
  mode.value = value;
  emit('change', value === OTHER ? other.value || null : value);
}

function clear() {
  mode.value = null;
  other.value = '';
  emit('change', null);
}
</script>

<template>
  <fieldset class="question" :data-field="field.id">
    <legend>{{ field.label }}</legend>
    <p v-if="field.hint" class="hint">{{ field.hint }}</p>
    <div class="choices">
      <label v-for="option in field.options ?? []" :key="option" :class="{selected: mode === option}">
        <input type="radio" :name="field.id" :value="option" :checked="mode === option"
               @change="select(option)">
        <span>{{ option }}</span>
      </label>
      <label :class="{selected: mode === OTHER}">
        <input type="radio" :name="field.id" :checked="mode === OTHER" @change="select(OTHER)">
        <span>其他</span>
      </label>
    </div>
    <el-input v-if="mode === OTHER" v-model="other" type="textarea" :autosize="{minRows: 2, maxRows: 6}"
              :aria-label="field.label + '：其他'" :maxlength="10000" placeholder="填写你的具体要求"
              @update:model-value="value => emit('change', value || null)" />
    <button v-if="mode !== null" class="clear-answer" type="button" :aria-label="'清空：' + field.label"
            @click="clear">清空</button>
  </fieldset>
</template>

<style scoped lang="scss">
.question { min-width: 0; border: 0; border-bottom: 1px solid #e7ece5; padding: 8px 0 22px; margin: 0 0 20px; }
legend { padding: 0; font-weight: 650; font-size: 16px; color: #263f33; }
.hint { font-size: 13px; color: #77867c; margin: 8px 0 0; }
.choices {
  display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0;
  label {
    display: flex; gap: 8px; align-items: center; padding: 10px 14px; border: 1px solid #dfe5dd;
    border-radius: 9px; cursor: pointer; background: #fafbf8; color: #52665a;
    &.selected { background: #eaf3eb; border-color: #648d72; color: #264d37; }
    &:focus-within { outline: 2px solid #b3cbb9; outline-offset: 2px; }
  }
  input { margin: 0; accent-color: #315c43; flex-shrink: 0; }
  span { overflow-wrap: anywhere; }
}
.clear-answer {
  display: block; margin: 12px 0 0 auto; padding: 0; border: 0; background: none;
  color: #819085; cursor: pointer; font-size: 12px;
}
</style>
