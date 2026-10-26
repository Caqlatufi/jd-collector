<script setup lang="ts">
import {computed} from 'vue';
import type {Posting} from '@/common/model/domain';

const props = defineProps<{posting: Posting}>();
const hasBossLink = computed(() => {
  try {
    const url = new URL(props.posting.sourceUrl || '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['www.zhipin.com', 'zhipin.com'].includes(url.hostname)
      && /^\/job_detail\/[^/]+\.html$/.test(url.pathname);
  } catch {
    return false;
  }
});
const available = computed(() => hasBossLink.value && props.posting.bossCompetitionStatus === 'AVAILABLE'
  && props.posting.bossRank != null && props.posting.bossCompetitorCount != null
  && props.posting.bossSurpassedPercent != null);
const emptyLabel = computed(() => {
  if (!hasBossLink.value) return '无 BOSS 直链';
  if (props.posting.bossCompetitionStatus === 'CLOSED') return '岗位已关闭';
  if (props.posting.bossCompetitionStatus === 'UNAVAILABLE') return '无竞争力报告';
  return '未采集';
});
const tooltip = computed(() => [props.posting.bossCompetitionNote,
  props.posting.bossCompetitionCheckedAt?.replace('T', ' ').slice(0, 16)].filter(Boolean).join(' · '));
</script>

<template>
  <div class="boss-competition" :title="tooltip">
    <template v-if="available">
      <div>{{ posting.bossRank }} / {{ posting.bossCompetitorCount }} 人</div>
      <div class="muted">超过 {{ posting.bossSurpassedPercent!.toFixed(2) }}% 竞争者</div>
    </template>
    <span v-else class="muted">{{ emptyLabel }}</span>
  </div>
</template>

<style scoped lang="scss">
.boss-competition { line-height: 1.7; }
</style>
