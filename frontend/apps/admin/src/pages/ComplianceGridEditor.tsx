import DataGrid from 'components/DataGrid';
import { complianceColumns, complianceLibrary } from 'utils/complianceLibrary';
import { defineComponent } from 'vue';
import type { VNode } from 'vue';

/** PROTOTYPE — the compliance library grid over its fake backend. */
export default defineComponent({
  name: 'ComplianceGridEditor',
  setup() {
    const columns = complianceColumns();
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
