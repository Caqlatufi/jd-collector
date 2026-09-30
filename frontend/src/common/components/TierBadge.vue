<script setup lang="ts">
import type {Tier} from '@/common/model/domain';
import {labelOf, tierOptions} from '@/common/model/options';

defineProps<{tier: Tier}>();
</script>

<template>
  <span class="tier-badge" :class="`tier-${tier.toLowerCase()}`" :data-tier="tier">{{ labelOf(tierOptions, tier) }}</span>
</template>

<style scoped>
.tier-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 48px;
  padding: 3px 9px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  white-space: nowrap;
}
.tier-s { color: #6b21a8; background: #f3e8ff; border-color: #c084fc; }
.tier-a { color: #1e40af; background: #dbeafe; border-color: #60a5fa; }
.tier-b { color: #92400e; background: #fef3c7; border-color: #fbbf24; }
.tier-skip { color: #475569; background: #f1f5f9; border-color: #94a3b8; }
</style>
