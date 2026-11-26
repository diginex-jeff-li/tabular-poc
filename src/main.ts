import 'styles/tailwind.css';
import ui from '@nuxt/ui/vue-plugin';
import Application from 'components/Application';
import router from 'config/router';

const app = createApp(Application).use(router).use(ui);

app.mount('#app');
