import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/interviews', name: 'interviews', redirect: to => ({path: '/', query: to.query}),
}];

export default function install(app: App): void { baseInstall(app, {routes}); }
