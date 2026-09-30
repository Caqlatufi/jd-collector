import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/interviews', name: 'interviews', meta: {title: '面试记录'},
  component: () => import('./pages/InterviewsPage.vue'),
}];

export default function install(app: App): void { baseInstall(app, {routes}); }
