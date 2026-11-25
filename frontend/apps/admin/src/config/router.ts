import { createRouter, createWebHistory } from 'vue-router';

const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');
const BulkInviteUsers = () => import('pages/BulkInviteUsers');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ComplianceGridEditor,
    },
    // Temporary: the compliance page on the TanStack engine until cutover (ticket 12).
    {
      path: '/next',
      component: ComplianceGridEditor,
      props: { engine: 'tanstack' },
    },
    {
      path: '/invite-users',
      component: BulkInviteUsers,
    },
  ],
});

export default router;
