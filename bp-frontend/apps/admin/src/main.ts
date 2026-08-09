import 'styles/tailwind.css';
import 'tabulator-tables/dist/css/tabulator_modern.min.css';
import ui from '@nuxt/ui/vue-plugin';
import Application from 'components/Application';
import { piniaColadaOptions } from 'config/pinia-colada';
import router from 'config/router';

const app = createApp(Application)
  .use(createPinia())
  .use(PiniaColada, piniaColadaOptions)
  .use(router)
  .use(ui);

app.mount('#app');
