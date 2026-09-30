<script setup lang="ts">
import type {DashboardPlanItem} from '@/common/model/domain';
import TierBadge from '@/common/components/TierBadge.vue';
import {computed, nextTick, ref, watch} from 'vue';
import dayjs from 'dayjs';
import {useRouter} from 'vue-router';

const props=defineProps<{items: DashboardPlanItem[]; serverNow: string}>();
const router=useRouter();
const today=computed(()=>props.serverNow.slice(0,10));
const month=ref(props.serverNow.slice(0,7));
const selectedDay=ref(today.value);
const onlyExceptions=ref(false);
const selected=ref<DashboardPlanItem>();
const dialogVisible=ref(false);
const scrollArea=ref<HTMLElement>();
const isException=(item:DashboardPlanItem)=>['OVERDUE','UNSCHEDULED','NO_SHOW'].includes(item.status);
const exceptions=computed(()=>props.items.filter(isException));
const monthItems=computed(()=>props.items.filter(p=>p.scheduledAt?.startsWith(month.value)));
const visibleItems=computed(()=>onlyExceptions.value ? exceptions.value : monthItems.value);
const dayItems=computed(()=>props.items.filter(p=>p.scheduledAt?.startsWith(selectedDay.value)));
const days=computed(()=>Array.from({length:dayjs(month.value+'-01').daysInMonth()},(_,i)=>{
  const date=dayjs(month.value+'-01').add(i,'day');
  return {key:date.format('YYYY-MM-DD'),label:i+1,week:['日','一','二','三','四','五','六'][date.day()],weekend:[0,6].includes(date.day())};
}));
const statusText=(item:DashboardPlanItem)=>({PLANNED:item.scheduledAt?.startsWith(today.value)?'今日计划':'待处理',OVERDUE:item.kind==='INTERVIEW'?'待确认结果':'超期待处理',COMPLETED:'已完成',UNSCHEDULED:'排期不完整',NO_SHOW:'已记录未出席'}[item.status]);
const kindText=(item:DashboardPlanItem)=>item.kind==='INTERVIEW'?'面试':'跟进';
const dateText=(item:DashboardPlanItem)=>item.scheduledAt?.replace('T',' ').slice(0,16)||'未设置时间';
const focusDate=async(date:string)=>{
  month.value=date.slice(0,7);selectedDay.value=date;
  await nextTick();
  const cell=scrollArea.value?.querySelector<HTMLElement>(`th[data-date="${date}"]`);
  if(cell&&scrollArea.value)scrollArea.value.scrollLeft=Math.max(0,cell.offsetLeft-260-88);
};
const goToday=()=>focusDate(today.value);
const moveMonth=(offset:number)=>{
  month.value=dayjs(month.value+'-01').add(offset,'month').format('YYYY-MM');
  selectedDay.value=month.value===today.value.slice(0,7)?today.value:month.value+'-01';
  if(scrollArea.value)scrollArea.value.scrollLeft=0;
};
const openItem=(item:DashboardPlanItem)=>{selected.value=item;dialogVisible.value=true;};
const goHandle=()=>{
  if(!selected.value)return;
  router.push({path:selected.value.kind==='INTERVIEW'?'/interviews':'/pipeline',query:{postingId:selected.value.postingId}});
};
watch(()=>props.serverNow,(_,previous)=>{
  if(!previous||month.value===previous.slice(0,7)&&today.value!==previous.slice(0,10))void goToday();
},{immediate:true});
</script>

<template>
  <article class="panel plan-panel">
    <div class="panel-heading plan-heading">
      <div><span class="eyebrow">SPRINT SCHEDULE</span><h3>求职计划时间图</h3><p class="plan-subtitle">今天 {{ today }} · 跟进与面试统一排期</p></div>
      <div class="plan-navigation"><el-button aria-label="上个月" @click="moveMonth(-1)">‹</el-button><strong>{{ month }}</strong><el-button aria-label="下个月" @click="moveMonth(1)">›</el-button><el-button @click="goToday">回到今天</el-button></div>
    </div>
    <div class="plan-notice" :class="{abnormal:exceptions.length>0}" role="status">
      <span>{{ exceptions.length ? `异常提醒：${exceptions.length} 项待处理` : '暂无超期或排期异常' }}</span>
      <span class="plan-notice-detail">{{ exceptions.length ? '包含跨月超期；面试过时仅提示补结果，不自动判定未出席。' : '到时未更新的跟进、面试会在这里提醒。' }}</span>
      <el-switch v-model="onlyExceptions" active-text="只看异常" />
    </div>
    <div class="plan-legend"><span><i class="legend-dot follow-up" />跟进</span><span><i class="legend-dot interview" />面试</span><span><i class="legend-dot overdue" />超期／异常</span><span><i class="legend-dot completed" />已完成</span><span><i class="legend-dot today" />今天</span><small>{{ onlyExceptions ? '全部异常（不限月份）' : `本月 ${monthItems.length} 项计划` }}</small></div>
    <div ref="scrollArea" class="plan-scroll" tabindex="0" aria-label="按日期排列的求职计划，可横向滚动">
      <table class="plan-table">
        <caption class="sr-only">{{ month }} 求职计划，今天 {{ today }}</caption>
        <colgroup><col class="plan-name-col" /><col v-for="day in days" :key="day.key" class="plan-day-col" /></colgroup>
        <thead><tr><th class="plan-name-cell" scope="col">公司 / 计划事项 <small>点击计划块查看和处理</small></th><th v-for="day in days" :key="day.key" scope="col" :data-date="day.key" :class="{'is-today':day.key===today,'is-weekend':day.weekend,'is-selected':day.key===selectedDay}"><button :aria-label="`${day.key}${day.key===today?' 今天':''}`" :aria-current="day.key===today?'date':undefined" @click="selectedDay=day.key"><b>{{ day.label }}</b><small>{{ day.key===today?'今天':day.week }}</small></button></th></tr></thead>
        <tbody>
          <tr v-for="item in visibleItems" :key="item.id" :data-plan-id="item.id" :class="{'exception-row':isException(item)}">
            <th class="plan-name-cell" scope="row"><button class="plan-task-name" @click="openItem(item)"><span><strong>{{ item.companyName }}</strong><TierBadge :tier="item.tier" /></span><span class="plan-job-title" :title="item.jobTitle">{{ item.jobTitle }}</span><span class="plan-task-title" :title="item.title">{{ kindText(item) }} · {{ item.title }}</span><small :class="{'exception-text':isException(item)}">{{ dateText(item) }} · {{ statusText(item) }}</small></button><button v-if="onlyExceptions && item.scheduledAt && !item.scheduledAt.startsWith(month)" class="locate-plan" @click="focusDate(item.scheduledAt.slice(0,10))">本月之外 · 定位日期 →</button></th>
            <td v-for="day in days" :key="day.key" :class="{'is-today':day.key===today,'is-weekend':day.weekend}">
              <button v-if="item.scheduledAt?.startsWith(day.key)" class="plan-block" :class="[item.kind.toLowerCase(),item.status.toLowerCase()]" :aria-label="`${item.companyName} ${kindText(item)} ${dateText(item)} ${statusText(item)}`" :title="`${item.title}\n${dateText(item)} · ${statusText(item)}`" @click="openItem(item)"><span>{{ item.status==='COMPLETED'?'✓':isException(item)?'!':kindText(item) }}</span><small>{{ item.scheduledAt.slice(11,16) }}</small></button>
            </td>
          </tr>
          <tr v-if="!visibleItems.length"><td class="plan-empty-label plan-name-cell">{{ onlyExceptions?'暂无异常事项':'本月暂无计划' }}</td><td v-for="day in days" :key="day.key" :class="{'is-today':day.key===today,'is-weekend':day.weekend}" /></tr>
        </tbody>
      </table>
    </div>
    <p class="plan-footnote">橙色整列为今天。没有明确行动或时间的岗位不会进入时间图；已填写行动但漏填时间的事项可在“只看异常”中查看。横向滚动可查看全月。</p>
    <div class="plan-day-agenda">
      <h4>{{ selectedDay }}{{ selectedDay===today?' · 今天':'' }} <small>{{ dayItems.length }} 项安排</small></h4>
      <p v-if="!dayItems.length" class="cell-subtitle">当天暂无跟进或面试计划，可到 Pipeline 设置下一步，或在面试记录中预约。</p>
      <button v-for="item in dayItems" :key="item.id" class="day-plan-item" @click="openItem(item)"><span>{{ item.scheduledAt?.slice(11,16) }} · {{ kindText(item) }}</span><strong>{{ item.companyName }} · {{ item.title }}</strong><span :class="{'exception-text':isException(item)}">{{ statusText(item) }}</span></button>
    </div>
    <el-dialog v-model="dialogVisible" title="计划详情" width="600px">
      <template v-if="selected"><h3>{{ selected.companyName }} · {{ selected.jobTitle }}</h3><p><TierBadge :tier="selected.tier" /> {{ kindText(selected) }} · {{ dateText(selected) }}</p><el-alert :title="statusText(selected)" :type="isException(selected)?'warning':selected.status==='COMPLETED'?'success':'info'" :closable="false" /><p class="pre-line">{{ selected.title }}</p><p class="cell-subtitle pre-line">{{ selected.description }}</p></template>
      <template #footer><el-button @click="dialogVisible=false">关闭</el-button><el-button type="primary" @click="goHandle">{{ selected?.kind==='INTERVIEW'?'去更新面试记录':'去处理跟进' }}</el-button></template>
    </el-dialog>
  </article>
</template>

<style scoped lang="scss">
.plan-panel {margin-top:20px;min-width:0;}
.plan-heading {gap:12px;flex-wrap:wrap;}
.plan-subtitle,.plan-footnote {color:#7b857e;font-size:12px;line-height:1.7;}
.plan-navigation {display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.plan-navigation .el-button+.el-button {margin-left:0;}
.plan-notice {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0 14px;padding:12px 14px;background:#f1f5f1;border:1px solid #d9e5dc;border-radius:10px;font-size:13px;}
.plan-notice.abnormal {background:#fff3ef;border-color:#f2b9aa;color:#a63a25;}
.plan-notice-detail {flex:1;min-width:160px;font-size:12px;}
.plan-legend {display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:12px;color:#67736b;}
.plan-legend span {display:flex;align-items:center;gap:5px;}
.plan-legend small {margin-left:auto;}
.legend-dot {width:10px;height:10px;border-radius:3px;display:inline-block;}
.legend-dot.follow-up {background:#287c99;}.legend-dot.interview {background:#8253a8;}.legend-dot.overdue {background:#ce5444;}.legend-dot.completed {background:#438566;}.legend-dot.today {background:#e7a331;}
.plan-scroll {max-height:640px;max-width:100%;overflow:auto;border:1px solid #dfe5dd;border-radius:10px;position:relative;scroll-padding-left:260px;}
.plan-table {border-spacing:0;table-layout:fixed;width:max-content;min-width:100%;font-size:12px;}
.plan-name-col {width:260px;}.plan-day-col {width:44px;}
.plan-table th,.plan-table td {min-width:44px;width:44px;padding:0;border-right:1px solid #e5e9e2;border-bottom:1px solid #e5e9e2;background:#fff;}
.plan-table thead th {position:sticky;top:0;z-index:3;height:62px;background:#f1f4ee;text-align:center;}
.plan-table thead button {width:100%;border:0;background:none;color:inherit;padding:10px 0;cursor:pointer;}
.plan-table thead b,.plan-table thead small {display:block;}.plan-table thead small {margin-top:5px;font-weight:400;font-size:10px;}
.plan-table .plan-name-cell {position:sticky;left:0;z-index:2;width:260px;min-width:260px;max-width:260px;box-shadow:2px 0 4px #15281c0a;text-align:left;}
.plan-table thead .plan-name-cell {z-index:5;padding:12px 14px;}.plan-table thead .plan-name-cell small {color:#7a847c;}
.plan-table td.is-weekend,.plan-table th.is-weekend {background:#f6f7f3;}
.plan-table td.is-today,.plan-table th.is-today {background:#fff1d2;border-left:2px solid #e7a331;border-right:2px solid #e7a331;}
.plan-table th.is-today {color:#9b5c04;}.plan-table th.is-selected button {box-shadow:inset 0 -3px #2b6f64;}
.plan-task-name {display:block;width:100%;padding:12px 14px;border:0;background:transparent;cursor:pointer;text-align:left;color:#263c30;font:inherit;}
.plan-task-name>span {display:block;}.plan-task-name>span:first-child {display:flex;align-items:center;gap:8px;}
.plan-job-title,.plan-task-title {overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-top:5px;color:#69786e;max-width:230px;}
.plan-task-name small {display:block;font-size:10px;margin-top:6px;font-weight:400;color:#7b857f;}
.plan-task-name .exception-text,.exception-text {color:#b24031;font-weight:600;}
.plan-block {border:0;border-radius:6px;width:40px;margin:0 1px;min-height:42px;background:#287c99;color:white;font-size:10px;cursor:pointer;box-shadow:0 2px 5px #142d1d20;}
.plan-block span,.plan-block small {display:block;}.plan-block small {font-size:9px;margin-top:4px;}
.plan-block.interview {background:#8253a8;}.plan-block.overdue,.plan-block.no_show {background:#ce5444;}.plan-block.unscheduled {background:#b87917;}.plan-block.completed {background:#438566;}
.plan-empty-label {height:130px;padding:20px!important;color:#829086;}
.locate-plan {margin:0 14px 10px;background:none;border:0;color:#b24031;cursor:pointer;font-size:11px;padding:0;}
.plan-day-agenda {border-top:1px solid #e6e9e2;padding-top:10px;margin-top:16px;}
.plan-day-agenda h4 {margin:5px 0 12px;font-size:14px;}.plan-day-agenda h4 small {font-size:12px;color:#7b857e;font-weight:400;margin-left:12px;}
.day-plan-item {display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:0;border-bottom:1px solid #edf0e9;background:none;text-align:left;width:100%;padding:12px 0;color:#5f7064;cursor:pointer;font:inherit;font-size:12px;}
.day-plan-item strong {flex:1;min-width:160px;font-weight:500;color:#233d2b;}
.sr-only {position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
@media(max-width:600px) {.plan-panel {padding:16px;}.plan-name-col,.plan-table .plan-name-cell {width:200px;min-width:200px;max-width:200px;}.plan-job-title,.plan-task-title {max-width:170px;}.plan-scroll {scroll-padding-left:200px;}.plan-legend {gap:9px;}}
</style>
