<script setup lang="ts">
import TierBadge from '@/common/components/TierBadge.vue';
import PlanTimeline from '@/dashboard/components/PlanTimeline.vue';
import {dashboardApi} from '@/dashboard/api/dashboardApi';
import type {DashboardData} from '@/common/model/domain';
import {tierOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import {onMounted, onUnmounted, ref} from 'vue';
import {useRouter} from 'vue-router';

const router=useRouter();
const loading=ref(false);
const loadError=ref(false);
const data=ref<DashboardData>({
  todayActions:[],overdueActions:[],nextSevenDayInterviews:[],stageCounts:{},tierCounts:{},planItems:[],
  conversion:{collected:0,applied:0,hrScreen:0,interviewed:0,offered:0,applyRate:0,interviewRate:0,offerRate:0},
});
const load=async()=>{
  if(loading.value)return;
  loading.value=true;
  try {data.value=await dashboardApi.today();loadError.value=false;}
  catch(error){loadError.value=true;showRequestError(error,'今日看板加载失败');}
  finally {loading.value=false;}
};
let refreshTimer:ReturnType<typeof setInterval>;
const refreshWhenVisible=()=>{if(!document.hidden)void load();};
onMounted(()=>{void load();refreshTimer=setInterval(refreshWhenVisible,60_000);document.addEventListener('visibilitychange',refreshWhenVisible);});
onUnmounted(()=>{clearInterval(refreshTimer);document.removeEventListener('visibilitychange',refreshWhenVisible);});
</script>

<template>
  <section v-loading="loading" class="dashboard">
    <div class="hero-card">
      <div><span class="eyebrow">DAILY SPRINT · 本地求职工作台</span><h2>按计划推进，让每一次沟通都有下一步。</h2><p>用 B/A 档校准回复、简历和报价，材料稳定后集中冲刺 S 档；先处理超期异常，再看今天安排。</p></div>
      <el-button type="primary" size="large" @click="router.push('/postings')">新增 JD</el-button>
    </div>
    <el-alert v-if="loadError" title="看板刷新失败，以下可能是旧数据。请点击刷新重试。" type="error" :closable="false" show-icon />
    <article class="panel funnel-panel">
      <div class="panel-heading"><div><span class="eyebrow">CONVERSION</span><h3>求职漏斗</h3></div><el-button link @click="load">刷新数据</el-button></div>
      <div class="funnel-grid">
        <div><span>收集</span><strong>{{ data.conversion.collected }}</strong></div>
        <div><span>投递</span><strong>{{ data.conversion.applied }}</strong><small>{{ data.conversion.applyRate }}%</small></div>
        <div><span>HR</span><strong>{{ data.conversion.hrScreen }}</strong></div>
        <div><span>技术面</span><strong>{{ data.conversion.interviewed }}</strong><small>{{ data.conversion.interviewRate }}%</small></div>
        <div><span>Offer</span><strong>{{ data.conversion.offered }}</strong><small>{{ data.conversion.offerRate }}%</small></div>
      </div>
    </article>
    <PlanTimeline v-if="data.serverNow" :items="data.planItems || []" :server-now="data.serverNow" />
    <article class="panel tier-panel">
      <div class="panel-heading"><div><span class="eyebrow">TIERS</span><h3>等级统计</h3></div></div>
      <div class="pipeline-summary dashboard-summary">
        <button v-for="item in tierOptions" :key="item.value" type="button" @click="router.push({path:'/postings',query:{tier:item.value}})"><TierBadge :tier="item.value" /><strong>{{ data.tierCounts[item.value] ?? 0 }}</strong></button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.tier-panel {margin-top:20px;}
@media(max-width:600px) {.funnel-grid div {padding:12px 8px;}.funnel-grid small {position:static;margin-top:5px;}.funnel-grid strong {font-size:24px;}}
</style>
