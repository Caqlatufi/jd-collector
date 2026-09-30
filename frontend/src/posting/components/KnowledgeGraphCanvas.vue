<script setup lang="ts">
import type {KnowledgeGraphEdge, KnowledgeGraphNode, PostingKnowledgeGraph} from '@/common/model/domain';
import {GraphChart} from 'echarts/charts';
import {TooltipComponent} from 'echarts/components';
import {init, use, type EChartsType} from 'echarts/core';
import {CanvasRenderer} from 'echarts/renderers';
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';

use([GraphChart, TooltipComponent, CanvasRenderer]);

export type GraphSelection =
  | {type: 'node'; value: KnowledgeGraphNode}
  | {type: 'edge'; value: KnowledgeGraphEdge};

const props = defineProps<{graph: PostingKnowledgeGraph; loading?: boolean}>();
const emit = defineEmits<{select: [selection: GraphSelection]}>();
const element = ref<HTMLDivElement>();
let chart: EChartsType | undefined;
let resizeObserver: ResizeObserver | undefined;

const nodeSize = (weightedCount: number, maxWeightedCount: number) =>
  Math.max(20, 84 * Math.sqrt(weightedCount / Math.max(1, maxWeightedCount)));
const nodeColor = (node: KnowledgeGraphNode) => node.highCount >= node.mediumCount && node.highCount >= node.lowCount
  ? '#d98324' : node.mediumCount >= node.lowCount ? '#3f7f72' : '#7d79a8';

const render = () => {
  if (!chart) return;
  const maxWeightedCount = Math.max(1, ...props.graph.nodes.map(node => node.weightedCount));
  chart.setOption({
    animationDurationUpdate: 400,
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      formatter: (raw: unknown) => {
        const params = raw as {dataType?: string; data?: KnowledgeGraphNode | (KnowledgeGraphEdge & {value: number})};
        if (params.dataType === 'edge') {
          const edge = params.data as KnowledgeGraphEdge;
          return `共同JD ${edge.documentCount}\n加权共现 ${edge.weightedCount}`;
        }
        const node = params.data as KnowledgeGraphNode;
        return `${node.label}\n覆盖JD ${node.documentCount}\n加权值 ${node.weightedCount}\n高/中/低 ${node.highCount}/${node.mediumCount}/${node.lowCount}`;
      },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      emphasis: {focus: 'adjacency'},
      force: {repulsion: 250, gravity: 0.08, edgeLength: [70, 190], layoutAnimation: true},
      label: {show: true, position: 'right', color: '#33413a', fontSize: 12},
      edgeSymbol: ['none', 'none'],
      data: props.graph.nodes.map(node => ({
        ...node,
        name: node.label,
        value: node.weightedCount,
        symbolSize: nodeSize(node.weightedCount, maxWeightedCount),
        itemStyle: {color: nodeColor(node), borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(31,53,43,.16)'},
      })),
      links: props.graph.edges.map(edge => ({
        ...edge,
        value: edge.weightedCount,
        lineStyle: {width: Math.max(1, Math.min(8, Math.sqrt(edge.weightedCount))), color: '#9caaa2', opacity: 0.58, curveness: 0.08},
      })),
    }],
  }, true);
};

onMounted(() => {
  if (!element.value) return;
  chart = init(element.value);
  chart.on('click', raw => {
    const params = raw as {dataType?: string; data?: KnowledgeGraphNode | KnowledgeGraphEdge};
    if (params.dataType === 'node' && params.data) emit('select', {type: 'node', value: params.data as KnowledgeGraphNode});
    if (params.dataType === 'edge' && params.data) emit('select', {type: 'edge', value: params.data as KnowledgeGraphEdge});
  });
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(element.value);
  render();
});

watch(() => props.graph, render, {deep: true});
watch(() => props.loading, value => value ? chart?.showLoading('default', {text: '正在计算图谱'}) : chart?.hideLoading());

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div ref="element" class="knowledge-graph-canvas" aria-label="JD知识图谱" />
</template>

<style scoped>
.knowledge-graph-canvas {
  width: 100%;
  min-height: 680px;
}
</style>
