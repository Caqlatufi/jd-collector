import type {App, Component} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

interface BaseInstallOptions {
  routes?: RouteRecordRaw[];
  components?: (Component & {name?: string})[];
}

export function baseInstall(app: App, options: BaseInstallOptions): void {
  if (options.routes?.length) {
    app.config.globalProperties.$routes = (app.config.globalProperties.$routes || []).concat(options.routes);
  }
  options.components?.forEach(component => {
    if (component.name) app.component(component.name, component);
  });
}
