import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/criteria',
  name: 'criteria',
  meta: {title: 'JD门槛', activeMenu: '/postings'},
  component: () => import('./pages/CriteriaPage.vue'),
}];

export default function install(app: App): void {
  baseInstall(app, {routes});
}
