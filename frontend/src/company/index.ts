import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/companies', name: 'companies', meta: {title: '公司库'},
  component: () => import('./pages/CompaniesPage.vue'),
}];

export default function install(app: App): void { baseInstall(app, {routes}); }
