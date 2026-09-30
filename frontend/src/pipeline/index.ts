import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/pipeline', name: 'pipeline', meta: {title: '投递 Pipeline'},
  component: () => import('./pages/PipelinePage.vue'),
}];

export default function install(app: App): void { baseInstall(app, {routes}); }
