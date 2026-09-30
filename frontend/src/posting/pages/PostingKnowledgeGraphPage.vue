<script setup lang="ts">
import type {Direction, PostingKnowledgeGraph, PostingKnowledgeOption, Stage, Tier} from '@/common/model/domain';
import {directionOptions, labelOf, stageOptions, tierOptions} from '@/common/model/options';
import {showRequestError} from '@/common/utils/error';
import KnowledgeGraphCanvas, {type GraphSelection} from '@/posting/components/KnowledgeGraphCanvas.vue';
import PostingTermEditor from '@/posting/components/PostingTermEditor.vue';
import {postingKnowledgeApi} from '@/posting/api/postingKnowledgeApi';
import {computed, onMounted, reactive, ref} from 'vue';
import {useRouter} from 'vue-router';

const router = useRouter();
const options = ref<PostingKnowledgeOption[]>([]);
const selectedIds = ref<number[]>([]);
const loadingOptions = ref(false);
const loadingGraph = ref(false);
const initialized = ref(false);
const editorVisible = ref(false);
const editingPosting = ref<PostingKnowledgeOption>();
const selection = ref<GraphSelection>();
const filters = reactive<{keyword: string; direction?: Direction; tier?: Tier; stage?: Stage}>({keyword: ''});
const settings = reactive({minDocumentCount: 2, minEdgeDocumentCount: 2, maxNodes: 80});
const graph = ref<PostingKnowledgeGraph>({
  selectedPostingCount: 0, processedPostingCount: 0, taggedPostingCount: 0, stalePostingCount: 0,
  unprocessedPostingIds: [], emptyPostingIds: [], stalePostingIds: [], nodes: [], edges: [],
});

const filteredOptions = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  return options.value.filter(item => (!keyword || `${item.companyName} ${item.title}`.toLowerCase().includes(keyword))
    && (!filters.direction || item.direction === filters.direction)
    && (!filters.tier || item.tier === filters.tier)
    && (!filters.stage || item.stage === filters.stage));
});
const optionMap = computed(() => new Map(options.value.map(item => [item.postingId, item])));
const selectedPostings = computed(() => {
  const ids = selection.value?.value.postingIds || [];
  return ids.map(id => optionMap.value.get(id)).filter((item): item is PostingKnowledgeOption => Boolean(item));
});
const selectionTitle = computed(() => {
  if (!selection.value) return '查看交叉来源';
  if (selection.value.type === 'node') return selection.value.value.label;
  const source = graph.value.nodes.find(node => node.id === selection.value?.value.source)?.label || selection.value.value.source;
  const target = graph.value.nodes.find(node => node.id === selection.value?.value.target)?.label || selection.value.value.target;
  return `${source} × ${target}`;
});

const loadOptions = async () => {
  loadingOptions.value = true;
  try {
    const rows = await postingKnowledgeApi.options();
    options.value = rows;
    if (!initialized.value) {
      selectedIds.value = rows.map(item => item.postingId);
      initialized.value = true;
    } else {
      const available = new Set(rows.map(item => item.postingId));
      selectedIds.value = selectedIds.value.filter(id => available.has(id));
    }
  } catch (error) { showRequestError(error, 'JD知识状态加载失败'); }
  finally { loadingOptions.value = false; }
};

const calculate = async () => {
  loadingGraph.value = true;
  selection.value = undefined;
  try {
    graph.value = await postingKnowledgeApi.graph({postingIds: selectedIds.value,
      minDocumentCount: settings.minDocumentCount, minEdgeDocumentCount: settings.minEdgeDocumentCount,
      maxNodes: settings.maxNodes});
  } catch (error) { showRequestError(error, '知识图谱计算失败'); }
  finally { loadingGraph.value = false; }
};

const refresh = async () => { await loadOptions(); await calculate(); };
const selectCurrent = () => { selectedIds.value = Array.from(new Set([...selectedIds.value, ...filteredOptions.value.map(item => item.postingId)])); };
const clearCurrent = () => {
  const current = new Set(filteredOptions.value.map(item => item.postingId));
  selectedIds.value = selectedIds.value.filter(id => !current.has(id));
};
const openEditor = (posting: PostingKnowledgeOption) => { editingPosting.value = posting; editorVisible.value = true; };
const afterSaved = async () => { await loadOptions(); await calculate(); };

onMounted(refresh);
</script>

<template>
  <section class="page-stack knowledge-page">
    <div class="page-toolbar wrap-toolbar">
      <div class="knowledge-heading">
        <div><el-button @click="router.push('/postings')">返回JD列表</el-button><strong class="knowledge-title">JD知识图谱</strong></div>
        <span class="toolbar-note">节点面积按3／2／1加权覆盖，连线表示知识词共同出现</span>
      </div>
      <div class="toolbar-actions">
        <el-input-number v-model="settings.minDocumentCount" :min="1" :max="500" controls-position="right" />
        <span class="setting-label">节点最少JD</span>
        <el-input-number v-model="settings.minEdgeDocumentCount" :min="1" :max="500" controls-position="right" />
        <span class="setting-label">边最少JD</span>
        <el-input-number v-model="settings.maxNodes" :min="10" :max="200" controls-position="right" />
        <span class="setting-label">最多节点</span>
        <el-button :loading="loadingOptions || loadingGraph" @click="refresh">刷新</el-button>
        <el-button type="primary" :loading="loadingGraph" @click="calculate">重新计算</el-button>
      </div>
    </div>

    <div class="knowledge-metrics">
      <div><span>已选择</span><strong>{{ graph.selectedPostingCount }}</strong></div>
      <div><span>已处理</span><strong>{{ graph.processedPostingCount }}</strong></div>
      <div><span>有效有词</span><strong>{{ graph.taggedPostingCount }}</strong></div>
      <div><span>过期</span><strong>{{ graph.stalePostingCount }}</strong></div>
      <div><span>知识节点</span><strong>{{ graph.nodes.length }}</strong></div>
      <div><span>交叉连线</span><strong>{{ graph.edges.length }}</strong></div>
    </div>

    <div class="knowledge-layout">
      <aside class="knowledge-selector">
        <div class="selector-filters">
          <el-input v-model="filters.keyword" clearable placeholder="搜索公司或岗位" />
          <el-select v-model="filters.direction" clearable placeholder="方向"><el-option v-for="item in directionOptions" :key="item.value" v-bind="item" /></el-select>
          <el-select v-model="filters.tier" clearable placeholder="等级"><el-option v-for="item in tierOptions" :key="item.value" v-bind="item" /></el-select>
          <el-select v-model="filters.stage" clearable placeholder="阶段"><el-option v-for="item in stageOptions" :key="item.value" v-bind="item" /></el-select>
        </div>
        <div class="selector-actions">
          <el-button size="small" @click="selectedIds = options.map(item => item.postingId)">全部选择</el-button>
          <el-button size="small" @click="selectCurrent">选择当前</el-button>
          <el-button size="small" @click="clearCurrent">清除当前</el-button>
        </div>
        <p class="selector-count">已勾选 {{ selectedIds.length }}／{{ options.length }}，当前筛选 {{ filteredOptions.length }}</p>
        <el-checkbox-group v-model="selectedIds" v-loading="loadingOptions" class="posting-checks">
          <div v-for="item in filteredOptions" :key="item.postingId" class="posting-check-row">
            <el-checkbox :value="item.postingId">
              <strong>{{ item.title }}</strong>
              <small>{{ item.companyName }} · {{ labelOf(tierOptions, item.tier) }}</small>
            </el-checkbox>
            <div class="posting-check-status">
              <span v-if="!item.processed" class="status-warning">未拆词</span>
              <span v-else-if="item.stale" class="status-warning">已过期</span>
              <span v-else>{{ item.termCount }}词</span>
              <el-button link @click.stop="openEditor(item)">编辑</el-button>
            </div>
          </div>
        </el-checkbox-group>
      </aside>

      <main class="knowledge-graph-panel">
        <KnowledgeGraphCanvas :graph="graph" :loading="loadingGraph" @select="selection = $event" />
        <div v-if="!loadingGraph && graph.nodes.length === 0" class="graph-empty">当前选择和阈值下没有可显示的知识交叉</div>
        <div class="graph-legend"><span class="legend-high" />高优先级占主导 <span class="legend-medium" />中优先级占主导 <span class="legend-low" />低优先级占主导</div>
      </main>

      <aside class="knowledge-detail">
        <h3>{{ selectionTitle }}</h3>
        <template v-if="selection">
          <p>覆盖JD：{{ selection.value.documentCount }}　加权值：{{ selection.value.weightedCount }}</p>
          <p v-if="selection.type === 'node'" class="detail-note">高／中／低：{{ selection.value.highCount }}／{{ selection.value.mediumCount }}／{{ selection.value.lowCount }}</p>
          <div v-for="item in selectedPostings" :key="item.postingId" class="source-posting">
            <strong>{{ item.title }}</strong><small>{{ item.companyName }}</small>
            <el-button link @click="openEditor(item)">查看三档词</el-button>
          </div>
        </template>
        <p v-else class="detail-note">点击知识节点查看它来自哪些JD；点击连线查看两个词共同出现的岗位。</p>
        <div v-if="graph.unprocessedPostingIds.length || graph.stalePostingIds.length" class="coverage-warning">
          未拆词 {{ graph.unprocessedPostingIds.length }} 条，过期 {{ graph.stalePostingIds.length }} 条；这些JD不参与当前图谱计算。
        </div>
      </aside>
    </div>

    <el-dialog v-model="editorVisible" :title="`${editingPosting?.companyName || ''} · ${editingPosting?.title || ''}`" width="720px" destroy-on-close>
      <PostingTermEditor v-if="editorVisible" :posting="editingPosting" @saved="afterSaved" />
    </el-dialog>
  </section>
</template>

<style scoped>
.knowledge-title {margin-left:14px;font-size:20px;color:#24372e;}
.wrap-toolbar {align-items:flex-start;gap:16px;}
.knowledge-heading {min-width:250px;}
.knowledge-heading .toolbar-note {display:block;margin:8px 0 0 16px;}
.toolbar-actions {flex-wrap:wrap;justify-content:flex-end;}
.setting-label {color:#77827c;font-size:12px;white-space:nowrap;}
.toolbar-actions :deep(.el-input-number) {width:104px;}
.knowledge-metrics {display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;}
.knowledge-metrics>div {padding:15px 17px;border:1px solid #e1e3dc;border-radius:14px;background:#fff;}
.knowledge-metrics span {display:block;color:#7c8781;font-size:12px;}
.knowledge-metrics strong {display:block;margin-top:5px;font-family:Georgia,serif;font-size:28px;color:#263d32;}
.knowledge-layout {display:grid;grid-template-columns:310px minmax(520px,1fr) 280px;min-height:720px;border:1px solid #dfe4dc;border-radius:18px;background:#fff;overflow:hidden;}
.knowledge-selector,.knowledge-detail {padding:16px;background:#fafbf8;}
.knowledge-selector {border-right:1px solid #e5e9e2;}
.knowledge-detail {border-left:1px solid #e5e9e2;}
.selector-filters {display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.selector-filters .el-input {grid-column:1/-1;}
.selector-actions {display:flex;gap:6px;margin-top:12px;}
.selector-actions .el-button {margin-left:0;}
.selector-count {color:#78837d;font-size:12px;}
.posting-checks {display:block;max-height:570px;overflow:auto;}
.posting-check-row {padding:10px 4px;border-top:1px solid #e6e9e3;}
.posting-check-row :deep(.el-checkbox) {height:auto;align-items:flex-start;white-space:normal;}
.posting-check-row small,.source-posting small {display:block;margin-top:3px;color:#849089;}
.posting-check-status {display:flex;justify-content:space-between;align-items:center;margin-left:24px;color:#839089;font-size:12px;}
.status-warning {color:#bd6f18;}
.knowledge-graph-panel {position:relative;min-width:0;background:radial-gradient(circle at center,#fbfcfa 0,#f4f6f1 100%);}
.graph-empty {position:absolute;inset:45% 20%;color:#87928c;text-align:center;pointer-events:none;}
.graph-legend {position:absolute;left:15px;bottom:12px;padding:8px 10px;border-radius:9px;background:rgb(255 255 255 / 88%);color:#68756e;font-size:12px;}
.graph-legend span {display:inline-block;width:9px;height:9px;margin:0 4px 0 10px;border-radius:50%;}
.legend-high {background:#d98324;}.legend-medium {background:#3f7f72;}.legend-low {background:#7d79a8;}
.knowledge-detail h3 {margin-top:0;}
.detail-note {color:#77847d;line-height:1.7;}
.source-posting {padding:10px 0;border-top:1px solid #e3e7e0;}
.coverage-warning {margin-top:18px;padding:12px;border-radius:10px;color:#8b5c1e;background:#fff4df;font-size:13px;line-height:1.6;}
@media (max-width: 1180px) {
  .wrap-toolbar {display:grid;grid-template-columns:1fr;}
  .toolbar-actions {justify-content:flex-start;}
  .knowledge-layout {grid-template-columns:280px minmax(430px,1fr);}
  .knowledge-detail {grid-column:1/-1;border-top:1px solid #e5e9e2;border-left:0;}
  .knowledge-metrics {grid-template-columns:repeat(3,minmax(0,1fr));}
}
@media (max-width: 800px) {
  .knowledge-layout {display:block;}
  .posting-checks {max-height:320px;}
  .knowledge-graph-panel {min-height:620px;}
  .knowledge-metrics {grid-template-columns:repeat(2,minmax(0,1fr));}
}
</style>
