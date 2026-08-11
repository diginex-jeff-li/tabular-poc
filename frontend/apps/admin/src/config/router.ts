import { createRouter, createWebHistory } from 'vue-router';

const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');
const CustomTableList = () => import('pages/CustomTableList');

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
  ],
});

export default router;