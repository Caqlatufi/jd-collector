import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/', name: 'dashboard', meta: {title: '今日看板'},
  component: () => import('./pages/DashboardPage.vue'),
}];

export default function install(app: App): void { baseInstall(app, {routes}); }
