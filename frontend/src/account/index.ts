import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';

export default function install(app: App): void {
  baseInstall(app, {routes: [{path: '/accounts', name: 'accounts', meta: {title: '平台账号'},
    component: () => import('./pages/AccountsPage.vue')} ]});
}
