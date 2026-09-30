import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/postings', name: 'postings', meta: {title: 'JD 列表'},
    component: () => import('./pages/PostingsPage.vue'),
  },
  {
    path: '/postings/knowledge-graph', name: 'posting-knowledge-graph',
    meta: {title: 'JD 知识图谱', activeMenu: '/postings'},
    component: () => import('./pages/PostingKnowledgeGraphPage.vue'),
  },
];

export default function install(app: App): void {
  baseInstall(app, {routes});
}
