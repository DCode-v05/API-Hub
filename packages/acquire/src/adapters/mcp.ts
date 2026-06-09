import type { McpSource, SourceAdapter, SourceRef } from '@cn/contracts';
import { error, warn } from '@cn/contracts';
import { buildArtifact } from '../artifact-build';
import { buildOpenApiFromOperations, emptyOpenApiDoc, type DerivedOperation } from '../openapi-shape';
import { introspectStdioServer, loadMcpManifest, type McpManifest } from '../mcp-client';
import { errMessage } from '../errors';

/**
 * Input 4: an existing MCP server. Read its advertised tools — from a manifest or a live stdio
 * handshake — and map each tool's inputSchema (already JSON Schema) into an operation. The
 * cleanest reverse-derivation of all, but still an inferred contract.
 */
export function createMcpAdapter(): SourceAdapter<McpSource> {
  return {
    name: 'mcp',
    detect: (source: SourceRef): source is McpSource => source.kind === 'mcp',
    async acquire(source, ctx) {
      const diagnostics = [];
      const origin = source.target;

      let manifest: McpManifest;
      try {
        manifest = source.command
          ? await introspectStdioServer(source.target)
          : await loadMcpManifest(source.target);
      } catch (e) {
        diagnostics.push(error('acq.mcp.introspect_failed', errMessage(e)));
        return buildArtifact({
          type: 'mcp',
          document: emptyOpenApiDoc(),
          diagnostics,
          provenance: { sourceKind: 'mcp', origin, trust: 'inferred', ctx, adapter: 'mcp' },
        });
      }

      if (manifest.tools.length === 0) {
        diagnostics.push(warn('acq.mcp.no_tools', 'MCP source advertised no tools'));
      }

      const ops: DerivedOperation[] = manifest.tools.map((tool) => {
        const op: DerivedOperation = { name: tool.name };
        if (tool.description) op.description = tool.description;
        if (tool.inputSchema) op.inputSchema = tool.inputSchema;
        return op;
      });

      const built = buildOpenApiFromOperations({
        title: manifest.info?.title ?? 'mcp-server',
        version: manifest.info?.version ?? '0.0.0',
        source: 'mcp',
        ops,
      });
      diagnostics.push(...built.diagnostics);

      return buildArtifact({
        type: 'mcp',
        document: built.document,
        diagnostics,
        provenance: { sourceKind: 'mcp', origin, trust: 'inferred', ctx, adapter: 'mcp' },
      });
    },
  };
}
