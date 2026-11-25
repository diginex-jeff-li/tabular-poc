/**
 * The compliance grid on Tabulator (comparison-only, `/tabulator`).
 *
 * Lives apart from `ComplianceGridEditor` so the page loads it, and with it
 * every Tabulator module, only on the Tabulator route.
 */
import GridEditor from 'components/GridEditor';
import { gridEngineProps } from 'components/gridEngineProps';
import { buildComplianceColumns } from 'composables/buildComplianceColumns';
import { defineComponent } from 'vue';
import type { VNode } from 'vue';

export default defineComponent({
  name: 'ComplianceTabulatorGrid',
  props: gridEngineProps,
  setup(props) {
    const columns = buildComplianceColumns();
    return (): VNode => <GridEditor {...props} columns={columns} />;
  },
});
