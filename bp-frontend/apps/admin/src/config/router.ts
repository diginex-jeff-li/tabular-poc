import { createRouter, createWebHistory } from 'vue-router';

const ItemListPage = () => import('pages/ItemListPage');
const ComplianceGridSpike = () => import('pages/ComplianceGridSpike');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ItemListPage,
    },
    {
      path: '/compliance-spike',
      component: ComplianceGridSpike,
    },
  ],
});

export default router;
