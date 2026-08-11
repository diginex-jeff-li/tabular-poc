import { createRouter, createWebHistory } from 'vue-router';

const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');
const CustomTableList = () => import('pages/CustomTableList');
const CustomTableBuilder = () => import('pages/CustomTableBuilder');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ComplianceGridEditor,
    },
    {
      path: '/custom',
      component: CustomTableList,
    },
    {
      path: '/custom/new',
      component: CustomTableBuilder,
    },
  ],
});

export default router;