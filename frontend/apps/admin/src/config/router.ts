import { createRouter, createWebHistory } from 'vue-router';

const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ComplianceGridEditor,
    },
  ],
});

export default router;