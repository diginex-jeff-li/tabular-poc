import { createRouter, createWebHistory } from 'vue-router';

const ComplianceGridEditor = () => import('pages/ComplianceGridEditor');
const BulkInviteUsers = () => import('pages/BulkInviteUsers');

// Each page runs on the TanStack `DataGrid` by default. The `/tabulator`
// routes keep the Tabulator `GridEditor` on the same data for comparison;
// the Tabulator code and CSS load only there.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ComplianceGridEditor,
      props: { engine: 'tanstack' },
    },
    {
      path: '/invite-users',
      component: BulkInviteUsers,
      props: { engine: 'tanstack' },
    },
    {
      path: '/tabulator',
      component: ComplianceGridEditor,
      props: { engine: 'tabulator' },
    },
    {
      path: '/tabulator/invite-users',
      component: BulkInviteUsers,
      props: { engine: 'tabulator' },
    },
  ],
});

export default router;
