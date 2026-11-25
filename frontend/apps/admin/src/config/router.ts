import { createRouter, createWebHistory } from 'vue-router';

const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');
const CustomTableList = () => import('pages/CustomTableList');
const CustomTableBuilder = () => import('pages/CustomTableBuilder');
const CustomTableEditor = () => import('pages/CustomTableEditor');
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
      path: '/custom',
      component: CustomTableList,
    },
    {
      path: '/custom/new',
      component: CustomTableBuilder,
    },
    {
      path: '/custom/:tableId',
      component: CustomTableEditor,
    },
    {
      path: '/invite-users',
      component: BulkInviteUsers,
    },
  ],
});

export default router;
