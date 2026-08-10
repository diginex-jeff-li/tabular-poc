import { createRouter, createWebHistory } from 'vue-router';

const ItemListPage = () => import('pages/ItemListPage');
const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ItemListPage,
    },
    {
      path: '/compliance-editor',
      component: ComplianceGridEditor,
    },
  ],
});

export default router;