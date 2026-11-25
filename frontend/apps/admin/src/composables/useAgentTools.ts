import { onBeforeUnmount, onMounted } from 'vue';
import type { AgentTool } from 'utils/inviteAgentTools';

/**
 * Expose agent tools two ways while the page is mounted:
 *
 * 1. WebMCP — `document.modelContext.registerTool` (current spec address;
 *    `navigator.modelContext` is the older one some engines still use).
 *    Present in the ChatGPT desktop built-in browser and in Chrome with
 *    `chrome://flags/#enable-webmcp-testing`. Tools unregister on unmount via
 *    the AbortSignal.
 * 2. `window[globalName]` — a plain JS bridge `{ webmcp, tools, call }` for
 *    agents that can run page scripts but do not discover WebMCP tools
 *    (Claude for Chrome). Calling it is NOT a WebMCP invocation.
 *
 * Both paths return the handler's plain object: Chrome expects `execute()`
 * to return a JSON-serializable value matching the tool's `outputSchema`.
 */
interface ModelContext {
  registerTool(tool: AgentTool, options?: { signal?: AbortSignal }): unknown;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export function useAgentTools(globalName: string, tools: AgentTool[]) {
  const controller = new AbortController();

  onMounted(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;

    for (const tool of modelContext ? tools : []) {
      const registered = modelContext.registerTool(
        { ...tool, execute: (args) => tool.execute(args ?? {}) },
        { signal: controller.signal },
      );
      Promise.resolve(registered).catch((err) =>
        console.warn(`WebMCP: ${tool.name} not registered`, err),
      );
    }

    Reflect.set(window, globalName, {
      webmcp: Boolean(modelContext),
      tools: tools.map(({ execute: _execute, ...meta }) => meta),
      call: (name: string, args: Record<string, unknown> = {}) => {
        const tool = tools.find((t) => t.name === name);
        if (!tool) throw new Error(`Unknown tool "${name}"`);
        return tool.execute(args);
      },
    });
  });

  onBeforeUnmount(() => {
    controller.abort();
    Reflect.deleteProperty(window, globalName);
  });
}
