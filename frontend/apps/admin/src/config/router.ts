import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('pages/ComplianceGridEditor') },
    { path: '/invite-users', component: () => import('pages/BulkInviteUsers') },
  ],
});

export default router;
