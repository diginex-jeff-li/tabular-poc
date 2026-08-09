import { createRouter, createWebHistory } from 'vue-router';

const ItemListPage = () => import('pages/ItemListPage');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ItemListPage,
    },
  ],
});

export default router;
