<script setup lang="ts">
import type {DashboardPlanItem} from '@/common/model/domain';
import TierBadge from '@/common/components/TierBadge.vue';
import {computed, nextTick, ref, watch} from 'vue';
import dayjs from 'dayjs';
import TimelineProgressDialog from './TimelineProgressDialog.vue';
import {useRoute} from 'vue-router';

const emit=defineEmits<{updated: []}>();

const props=defineProps<{items: DashboardPlanItem[]; serverNow: string}>();
const route=useRoute();
const today=computed(()=>props.serverNow.slice(0,10));
const month=ref(props.serverNow.slice(0,7));
const selectedDay=ref(today.value);
const onlyExceptions=ref(false);
type ProgressType='ACTIVE'|'REJECTED'|'WITHDRAWN'|'CLOSED'|'CANCELLED'|'TIMED_OUT'|'COMPLETED'|'ENDED';
const progressType=ref<ProgressType>('ACTIVE');
const endedTypes:Record<string,ProgressType>={'被拒':'REJECTED','主动终止':'WITHDRAWN','已关闭':'CLOSED'};
const progressTypes=[
  {value:'ACTIVE',label:'进行中'}, {value:'REJECTED',label:'被拒'},
  {value:'WITHDRAWN',label:'主动终止'}, {value:'CLOSED',label:'已关闭'},
  {value:'CANCELLED',label:'已取消'}, {value:'TIMED_OUT',label:'超时'},
  {value:'COMPLETED',label:'已接受'}, {value:'ENDED',label:'其他结束'},
];
const selected=ref<DashboardPlanItem>();
const dialogVisible=ref(false);
const scrollArea=ref<HTMLElement>();
const isException=(item:DashboardPlanItem)=>['OVERDUE','UNSCHEDULED','NO_SHOW'].includes(item.status);
const isWaiting=(item:DashboardPlanItem)=>item.kind==='APPLICATION'&&['WAITING_FEEDBACK','NO_FEEDBACK','TIMED_OUT'].includes(item.status);
const allRows=computed(()=>{
  const groups=new Map<number,DashboardPlanItem[]>();
  for(const item of props.items){
    const items=groups.get(item.postingId)??[];
    items.push(item);groups.set(item.postingId,items);
  }
  return [...groups].map(([postingId,items])=>{
    items.sort((a,b)=>(a.scheduledAt??'').localeCompare(b.scheduledAt??'')||a.id.localeCompare(b.id));
    const progress=items.filter(item=>item.kind!=='APPLICATION');
    const application=items.find(item=>item.kind==='APPLICATION');
    const ended=progress.filter(item=>item.kind==='STAGE'&&item.status==='ENDED');
    const hasPendingInterview=progress.some(item=>item.kind==='INTERVIEW'&&['PLANNED','OVERDUE'].includes(item.status));
    const currentProgress=hasPendingInterview?progress.filter(item=>item.status!=='CANCELLED'):progress;
    const latest=application&&['TIMED_OUT','NO_FEEDBACK'].includes(application.status)?application
      :application?.status==='ENDED'?ended[ended.length-1]??application
      :currentProgress[currentProgress.length-1]??application??items[0]!;
    const type:ProgressType=application&&['TIMED_OUT','NO_FEEDBACK'].includes(application.status)?'TIMED_OUT'
      :application?.status==='COMPLETED'?'COMPLETED'
      :latest.status==='ENDED'?endedTypes[latest.title]??'ENDED'
      :latest.status==='CANCELLED'?'CANCELLED':'ACTIVE';
    return {postingId,items,latest,type,abnormal:items.some(isException)};
  });
});
// 按岗位当前类型筛选，选中后保留该岗位的全部历史节点。
const typeRows=computed(()=>allRows.value.filter(row=>row.type===progressType.value));
const typeItems=computed(()=>typeRows.value.flatMap(row=>row.items));
const exceptions=computed(()=>typeItems.value.filter(isException));
const monthItems=computed(()=>typeItems.value.filter(p=>p.scheduledAt?.startsWith(month.value)
  ||isWaiting(p)&&(p.feedbackDueAt?.startsWith(month.value)
    ||!!p.scheduledAt&&p.scheduledAt.slice(0,7)<=month.value&&today.value.slice(0,7)>=month.value)));
const rows=computed(()=>{
  const ids=new Set((onlyExceptions.value?exceptions.value:monthItems.value).map(item=>item.postingId));
  return typeRows.value.filter(row=>ids.has(row.postingId));
});
const emptyText=computed(()=>onlyExceptions.value?'当前类型暂无异常事项'
  :progressType.value==='ACTIVE'?'本月暂无进行中的计划':`本月暂无${progressTypes.find(t=>t.value===progressType.value)?.label}记录`);
const cellItems=(items:DashboardPlanItem[],date:string)=>items.filter(item=>!!blockText(item,date));
const isDeadline=(item:DashboardPlanItem,date:string)=>isWaiting(item)&&!!item.feedbackDueAt?.startsWith(date);
const blockText=(item:DashboardPlanItem,date:string)=>{
  if(item.scheduledAt?.startsWith(date))return item.kind==='APPLICATION'?'投递':item.kind==='STAGE'?item.title:kindText(item);
  return isDeadline(item,date)?(['TIMED_OUT','NO_FEEDBACK'].includes(item.status)?'超时':'14天'):'';
};
const progressColor=(item:DashboardPlanItem)=>{
  if(['ENDED','CANCELLED','TIMED_OUT','NO_FEEDBACK'].includes(item.status))return '#7b857e';
  if(['OVERDUE','NO_SHOW'].includes(item.status))return '#ce5444';
  if(item.kind==='INTERVIEW')return item.status==='COMPLETED'?'#438566':'#8253a8';
  if(item.kind==='APPLICATION')return '#3b6d9c';
  return item.status==='COMPLETED'?'#438566':'#287c99';
};
const rangeCell=(row:typeof rows.value[number],date:string)=>{
  const start=row.items.find(item=>item.kind==='APPLICATION')?.scheduledAt?.slice(0,10);
  const end=isWaiting(row.latest)?row.latest.feedbackDueAt?.slice(0,10):row.latest.scheduledAt?.slice(0,10);
  return !!start&&!!end&&date>=start&&date<=end;
};
const cellStyle=(row:typeof rows.value[number],date:string)=>rangeCell(row,date)
  ? {'--progress-band':progressColor(row.latest)+'26'} : {};
const dayItems=computed(()=>rows.value.flatMap(row=>row.items).filter(p=>!!blockText(p,selectedDay.value)));
const days=computed(()=>Array.from({length:dayjs(month.value+'-01').daysInMonth()},(_,i)=>{
  const date=dayjs(month.value+'-01').add(i,'day');
  return {key:date.format('YYYY-MM-DD'),label:i+1,week:['日','一','二','三','四','五','六'][date.day()],weekend:[0,6].includes(date.day())};
}));
const statusText=(item:DashboardPlanItem)=>({PLANNED:item.scheduledAt?.startsWith(today.value)?'今日计划':'待处理',OVERDUE:item.kind==='INTERVIEW'?'待确认结果':'超期待处理',ENDED:'流程已结束',CANCELLED:'已取消',COMPLETED:item.kind==='APPLICATION'?'已结束':'已完成',UNSCHEDULED:'排期不完整',NO_SHOW:'已记录未出席',WAITING_FEEDBACK:`等待反馈 · 已投递${item.elapsedDays ?? 0}天`,FEEDBACK_RECEIVED:'已收到反馈',NO_FEEDBACK:`超时 · 超过14天无反馈`,TIMED_OUT:`超时 · 已投递${item.elapsedDays ?? 0}天`}[item.status]);
const kindText=(item:DashboardPlanItem)=>item.kind==='APPLICATION'?'投递':item.kind==='INTERVIEW'?'面试':item.kind==='STAGE'?'进度':'跟进';
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
watch(()=>props.serverNow,(_,previous)=>{
  if(!previous||month.value===previous.slice(0,7)&&today.value!==previous.slice(0,10))void goToday();
},{immediate:true});
watch(()=>[route.query.postingId,typeItems.value] as const,async()=>{
  const matching=typeItems.value.filter(p=>p.postingId===Number(route.query.postingId)&&p.scheduledAt);
  const item=matching[matching.length-1];
  if(!item?.scheduledAt)return;
  await focusDate(item.scheduledAt.slice(0,10));
  scrollArea.value?.querySelector(`tr[data-posting-id="${item.postingId}"]`)?.scrollIntoView({block:'nearest'});
},{immediate:true});
</script>

<template>
  <article class="panel plan-panel">
    <div class="panel-heading plan-heading">
      <div><span class="eyebrow">APPLICATION PROGRESS</span><h3>求职进度时间图</h3><p class="plan-subtitle">今天 {{ today }} · 投递自动入图，超过14天无反馈自动置灰为超时</p></div>
      <div class="plan-navigation"><el-select v-model="progressType" aria-label="进度类型" class="progress-type-filter" :clearable="false" @change="onlyExceptions=false"><el-option v-for="type in progressTypes" :key="type.value" :value="type.value" :label="type.label" /></el-select><el-button aria-label="上个月" @click="moveMonth(-1)">‹</el-button><strong>{{ month }}</strong><el-button aria-label="下个月" @click="moveMonth(1)">›</el-button><el-button @click="goToday">回到今天</el-button></div>
    </div>
    <div class="plan-notice" :class="{abnormal:exceptions.length>0}" role="status">
      <span>{{ exceptions.length ? `异常提醒：${exceptions.length} 项待处理` : '暂无超期或排期异常' }}</span>
      <span class="plan-notice-detail">{{ exceptions.length ? '面试过时提醒补结果；14天无反馈自动标为超时并置灰。' : '点击节点可推进进度或修改记录；14天无反馈自动标为超时并置灰。' }}</span>
      <el-switch v-model="onlyExceptions" active-text="只看异常" />
    </div>
    <div class="plan-legend"><span><i class="legend-dot application" />投递</span><span><i class="legend-dot follow-up" />跟进</span><span><i class="legend-dot interview" />面试</span><span><i class="legend-dot overdue" />异常</span><span><i class="legend-dot completed" />已完成</span><span><i class="legend-dot ended" />被拒／终止／超时</span><span><i class="legend-dot today" />今天</span><small>{{ onlyExceptions ? '全部异常（不限月份）' : `本月 ${monthItems.length} 项进度与安排` }}</small></div>
    <div ref="scrollArea" class="plan-scroll" tabindex="0" aria-label="按日期排列的求职计划，可横向滚动">
      <table class="plan-table">
        <caption class="sr-only">{{ month }} 求职进度，今天 {{ today }}</caption>
        <colgroup><col class="plan-name-col" /><col v-for="day in days" :key="day.key" class="plan-day-col" /></colgroup>
        <thead><tr><th class="plan-name-cell" scope="col">公司 / 进度与安排 <small>点击标记查看和更新</small></th><th v-for="day in days" :key="day.key" scope="col" :data-date="day.key" :class="{'is-today':day.key===today,'is-weekend':day.weekend,'is-selected':day.key===selectedDay}"><button :aria-label="`${day.key}${day.key===today?' 今天':''}`" :aria-current="day.key===today?'date':undefined" @click="selectedDay=day.key"><b>{{ day.label }}</b><small>{{ day.key===today?'今天':day.week }}</small></button></th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.postingId" :data-posting-id="row.postingId" :class="{'exception-row':row.abnormal}">
            <th class="plan-name-cell" scope="row"><button class="plan-task-name" @click="openItem(row.latest)"><span><strong>{{ row.latest.companyName }}</strong><TierBadge :tier="row.latest.tier" /></span><span class="plan-job-title" :title="row.latest.jobTitle">{{ row.latest.jobTitle }}</span><span class="plan-task-title">{{ row.items.length }} 个节点 · {{ row.latest.title }}</span><small :class="{'exception-text':row.abnormal}">{{ statusText(row.latest) }}</small></button><template v-if="onlyExceptions"><button v-for="item in row.items.filter(p=>isException(p)&&p.scheduledAt&&!p.scheduledAt.startsWith(month))" :key="item.id" class="locate-plan" @click="focusDate(item.scheduledAt!.slice(0,10))">本月之外 · 定位日期 →</button></template></th>
            <td v-for="day in days" :key="day.key" :data-date="day.key" :style="cellStyle(row,day.key)" :class="{'is-today':day.key===today,'is-weekend':day.weekend,'progress-range':rangeCell(row,day.key)}">
              <button v-for="item in cellItems(row.items,day.key)" :key="item.id" :data-plan-id="item.id" class="plan-block"
                :class="[item.kind.toLowerCase(),item.status.toLowerCase(),{'feedback-deadline':isDeadline(item,day.key)}]"
                :style="{backgroundColor:progressColor(row.latest.status==='ENDED'?row.latest:item)}"
                :aria-label="`${item.companyName} ${isDeadline(item,day.key)?'14天超时节点':blockText(item,day.key)} ${day.key} ${statusText(item)}`"
                :title="isDeadline(item,day.key)?`14天超时节点：${item.feedbackDueAt?.replace('T',' ').slice(0,16)}\n超过此时间仍无反馈时自动标为超时`:`${item.title}\n${dateText(item)} · ${statusText(item)}`"
                @click="openItem(item)"><span>{{ blockText(item,day.key) }}</span><small>{{ item.kind==='APPLICATION'?day.key.slice(5):item.scheduledAt?.slice(11,16) }}</small></button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td class="plan-empty-label plan-name-cell">{{ emptyText }}</td><td v-for="day in days" :key="day.key" :class="{'is-today':day.key===today,'is-weekend':day.weekend}" /></tr>
        </tbody>
      </table>
    </div>
    <p class="plan-footnote">默认只显示进行中的岗位；被拒、终止、取消和超时等结束类型需在右上角明确选择后查看。橙色整列为今天，半透明色带与最后一步动作同色。点击节点可推进进度、修改记录或维护面试复盘。</p>
    <div class="plan-day-agenda">
      <h4>{{ selectedDay }}{{ selectedDay===today?' · 今天':'' }} <small>{{ dayItems.length }} 项安排</small></h4>
      <p v-if="!dayItems.length" class="cell-subtitle">当天暂无投递进度、跟进或面试安排。记录投递后会自动进入时间图。</p>
      <button v-for="item in dayItems" :key="item.id" class="day-plan-item" @click="openItem(item)"><span>{{ item.kind==='APPLICATION'?(item.scheduledAt?.startsWith(selectedDay)?'投递记录':'反馈观察'):item.scheduledAt?.slice(11,16)+' · '+kindText(item) }}</span><strong>{{ item.companyName }} · {{ item.title }}</strong><span :class="{'exception-text':isException(item)}">{{ statusText(item) }}</span></button>
    </div>
    <TimelineProgressDialog v-if="dialogVisible&&selected" :key="selected.id" :item="selected"
      @close="dialogVisible=false" @saved="emit('updated')" />
  </article>
</template>

<style scoped lang="scss">
.plan-panel {margin-top:20px;min-width:0;}
.plan-heading {gap:12px;flex-wrap:wrap;}
.plan-subtitle,.plan-footnote {color:#7b857e;font-size:12px;line-height:1.7;}
.plan-navigation {display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.plan-navigation .el-button+.el-button {margin-left:0;}
.progress-type-filter {width:150px;}
.plan-notice {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0 14px;padding:12px 14px;background:#f1f5f1;border:1px solid #d9e5dc;border-radius:10px;font-size:13px;}
.plan-notice.abnormal {background:#fff3ef;border-color:#f2b9aa;color:#a63a25;}
.plan-notice-detail {flex:1;min-width:160px;font-size:12px;}
.plan-legend {display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:12px;color:#67736b;}
.plan-legend span {display:flex;align-items:center;gap:5px;}
.plan-legend small {margin-left:auto;}
.legend-dot {width:10px;height:10px;border-radius:3px;display:inline-block;}
.legend-dot.ended {background:#7b857e;}.legend-dot.application {background:#3b6d9c;}.legend-dot.follow-up {background:#287c99;}.legend-dot.interview {background:#8253a8;}.legend-dot.overdue {background:#ce5444;}.legend-dot.completed {background:#438566;}.legend-dot.today {background:#e7a331;}
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
.plan-table td.progress-range {background:linear-gradient(var(--progress-band),var(--progress-band)),#fff;}
.plan-table td.is-today,.plan-table th.is-today {background:#fff1d2;border-left:2px solid #e7a331;border-right:2px solid #e7a331;}
.plan-table th.is-today {color:#9b5c04;}.plan-table th.is-selected button {box-shadow:inset 0 -3px #2b6f64;}
.plan-task-name {display:block;width:100%;padding:12px 14px;border:0;background:transparent;cursor:pointer;text-align:left;color:#263c30;font:inherit;}
.plan-task-name>span {display:block;}.plan-task-name>span:first-child {display:flex;align-items:center;gap:8px;}
.plan-job-title,.plan-task-title {overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-top:5px;color:#69786e;max-width:230px;}
.plan-task-name small {display:block;font-size:10px;margin-top:6px;font-weight:400;color:#7b857f;}
.plan-task-name .exception-text,.exception-text {color:#b24031;font-weight:600;}
.plan-block {display:block;border:0;border-radius:6px;width:40px;margin:4px 1px;padding:5px 0;white-space:nowrap;min-height:42px;background:#287c99;color:white;font-size:10px;cursor:pointer;box-shadow:0 2px 5px #142d1d20;}
.plan-block span,.plan-block small {display:block;}.plan-block small {font-size:9px;margin-top:4px;}
.plan-block.application {background:#3b6d9c;}.plan-block.interview {background:#8253a8;}.plan-block.overdue,.plan-block.no_show,.plan-block.no_feedback {background:#ce5444;}.plan-block.unscheduled {background:#b87917;}.plan-block.completed,.plan-block.feedback_received {background:#438566;}
.plan-block.timed_out,.plan-block.no_feedback,.plan-block.cancelled,.plan-block.ended {background:#7b857e;}
.plan-block.feedback-deadline {background:#ce5444;}
.plan-empty-label {height:130px;padding:20px!important;color:#829086;}
.locate-plan {margin:0 14px 10px;background:none;border:0;color:#b24031;cursor:pointer;font-size:11px;padding:0;}
.plan-day-agenda {border-top:1px solid #e6e9e2;padding-top:10px;margin-top:16px;}
.plan-day-agenda h4 {margin:5px 0 12px;font-size:14px;}.plan-day-agenda h4 small {font-size:12px;color:#7b857e;font-weight:400;margin-left:12px;}
.day-plan-item {display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:0;border-bottom:1px solid #edf0e9;background:none;text-align:left;width:100%;padding:12px 0;color:#5f7064;cursor:pointer;font:inherit;font-size:12px;}
.day-plan-item strong {flex:1;min-width:160px;font-weight:500;color:#233d2b;}
.sr-only {position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
@media(max-width:600px) {.plan-panel {padding:16px;}.plan-name-col,.plan-table .plan-name-cell {width:200px;min-width:200px;max-width:200px;}.plan-job-title,.plan-task-title {max-width:170px;}.plan-scroll {scroll-padding-left:200px;}.plan-legend {gap:9px;}}
</style>
