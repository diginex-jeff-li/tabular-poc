import DataGrid from 'components/DataGrid';
import { buildComplianceGridColumns } from 'composables/buildComplianceGridColumns';
import { complianceLibrary } from 'utils/complianceLibrary';
import { defineComponent } from 'vue';
import type { VNode } from 'vue';

/** PROTOTYPE — the compliance library grid over its fake backend. */
export default defineComponent({
  name: 'ComplianceGridEditor',
  setup() {
    const columns = buildComplianceGridColumns();
    return (): VNode => (
      <DataGrid
        columns={columns}
        data={complianceLibrary.list()}
        onSave={complianceLibrary.save}
        title="Compliance Library Editor"
        exportFilename="compliance-library.csv"
      />
    );
  },
});
