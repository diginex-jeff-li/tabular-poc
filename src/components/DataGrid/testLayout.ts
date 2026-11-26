import { ROW_HEIGHT } from 'composables/useDataGrid';
import { afterEach, beforeEach, vi } from 'vite-plus/test';

/** happy-dom's observer reports 0×0 boxes, which would override the stubbed sizes. */
class SilentResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * happy-dom lays nothing out, so every size is 0 and `DataGrid`'s row
 * virtualizer renders no rows. Call at a test file's top level: every
 * element is `ROW_HEIGHT` tall (`offsetHeight`, which the virtualizer
 * measures rows with) and shows `viewport` px (`clientHeight`, which it sizes
 * the scroll container with), so the grid shows `viewport / ROW_HEIGHT` rows.
 * Applied per test, so a test's `vi.restoreAllMocks()` doesn't remove it.
 */
export function useGridLayout(viewport = 20 * ROW_HEIGHT): void {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
      ROW_HEIGHT,
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
      viewport,
    );
    vi.stubGlobal('ResizeObserver', SilentResizeObserver);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}
