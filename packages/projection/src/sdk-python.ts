import type { GeneratedFile } from '@cn/contracts';
import { pascalIdent } from './naming';
import { pyType } from './typemap';
import type { PlannedOp, PlannedParam, PlannedResource, ProjectionPlan } from './plan';
import { DO_NOT_EDIT } from './gen-util';
import { pyDoc, pySafeIdent, uniquify } from './idents';

/** Project the IR into an installable Python SDK package. */
export function generatePythonSdk(plan: ProjectionPlan): GeneratedFile[] {
  const mod = plan.pyModule;
  return [
    { path: 'pyproject.toml', content: pyproject(plan) },
    { path: 'README.md', content: readme(plan) },
    { path: `${mod}/__init__.py`, content: initPy() },
    { path: `${mod}/_http.py`, content: HTTP_PY },
    { path: `${mod}/models.py`, content: models(plan) },
    { path: `${mod}/client.py`, content: client(plan) },
  ];
}

/** Map each param's wire name → a safe, unique-within-this-scope Python identifier. */
function varMap(params: PlannedParam[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const p of params) map.set(p.name, uniquify(pySafeIdent(p.name), used));
  return map;
}

/** A Python type annotation. `qualified` prefixes refs with `models.` (used outside models.py). */
function pyTypeOf(plan: ProjectionPlan, t: { type: string; ref?: string }, qualified: boolean): string {
  if (t.ref) {
    const cls = plan.modelClassByName.get(t.ref) ?? pascalIdent(t.ref);
    return qualified ? `models.${cls}` : cls;
  }
  return pyType(t);
}

function annotation(plan: ProjectionPlan, p: PlannedParam): string {
  const base = pyTypeOf(plan, p, true);
  return p.required ? base : `Optional[${base}]`;
}

function signature(plan: ProjectionPlan, op: PlannedOp, vars: Map<string, string>): string {
  if (op.params.length === 0) return '(self)';
  const args = op.params.map((p) => {
    const v = vars.get(p.name)!;
    const ann = annotation(plan, p);
    return p.required ? `${v}: ${ann}` : `${v}: ${ann} = None`;
  });
  return `(self, *, ${args.join(', ')})`;
}

function dictLiteral(params: PlannedParam[], vars: Map<string, string>): string {
  return `{${params.map((p) => `${JSON.stringify(p.name)}: ${vars.get(p.name)}`).join(', ')}}`;
}

function pyPath(op: PlannedOp, vars: Map<string, string>): string {
  if (op.pathParams.length === 0) return JSON.stringify(op.path);
  const body = op.path.replace(
    /\{([^}]+)\}/g,
    (_m, n: string) => '{quote(str(' + (vars.get(n) ?? pySafeIdent(n)) + '))}',
  );
  return 'f' + JSON.stringify(body);
}

function method(plan: ProjectionPlan, op: PlannedOp): string {
  const vars = varMap(op.params);
  const ret = op.returnRef ? pyTypeOf(plan, { type: 'object', ref: op.returnRef }, true) : 'Any';
  const callArgs = [JSON.stringify(op.httpMethod), pyPath(op, vars)];
  if (op.queryParams.length > 0) callArgs.push(`query=${dictLiteral(op.queryParams, vars)}`);
  if (op.bodyParams.length > 0) callArgs.push(`body=${dictLiteral(op.bodyParams, vars)}`);
  if (op.headerParams.length > 0) callArgs.push(`headers=${dictLiteral(op.headerParams, vars)}`);
  const doc = op.summary ?? op.description;
  const docstring = doc ? `        """${pyDoc(doc)}"""\n` : '';
  return (
    `    def ${op.methodName}${signature(plan, op, vars)} -> ${ret}:\n` +
    docstring +
    `        return self._http.request(${callArgs.join(', ')})\n`
  );
}

function resourceClass(plan: ProjectionPlan, res: PlannedResource): string {
  return (
    `class ${res.className}:\n` +
    `    def __init__(self, http: HttpClient) -> None:\n` +
    `        self._http = http\n\n` +
    res.ops.map((op) => method(plan, op)).join('\n')
  );
}

function client(plan: ProjectionPlan): string {
  const resourceClasses = plan.resources.map((r) => resourceClass(plan, r)).join('\n\n');
  const inits = plan.resources.map((r) => `        self.${r.prop} = ${r.className}(self._http)`).join('\n');
  return (
    `# ${DO_NOT_EDIT}\n` +
    `from __future__ import annotations\n` +
    `from typing import Any, Optional\n` +
    `from urllib.parse import quote\n` +
    `from ._http import HttpClient\n` +
    `from . import models\n\n` +
    `DEFAULT_BASE_URL = ${JSON.stringify(plan.server)}\n\n` +
    `${resourceClasses}\n\n` +
    `class Client:\n` +
    `    """${pyDoc(plan.title)} — generated client."""\n\n` +
    `    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None) -> None:\n` +
    `        self._http = HttpClient(base_url or DEFAULT_BASE_URL, token)\n` +
    `${inits}\n`
  );
}

function models(plan: ProjectionPlan): string {
  const out: string[] = [
    `# ${DO_NOT_EDIT}`,
    'from __future__ import annotations',
    'from dataclasses import dataclass',
    'from typing import Any, Optional',
    '',
  ];
  if (plan.models.length === 0) out.push('# (no component schemas)');
  for (const model of plan.models) {
    out.push('@dataclass', `class ${model.className}:`);
    // dataclass: non-default fields must precede default fields.
    const ordered = [...model.fields].sort((a, b) => Number(b.required) - Number(a.required));
    if (ordered.length === 0) out.push('    pass');
    const used = new Set<string>();
    for (const f of ordered) {
      const v = uniquify(pySafeIdent(f.name), used);
      const base = pyTypeOf(plan, f, false);
      const ann = f.required ? base : `Optional[${base}]`;
      out.push(`    ${v}: ${ann}${f.required ? '' : ' = None'}`);
    }
    out.push('');
  }
  return out.join('\n');
}

function initPy(): string {
  return `# ${DO_NOT_EDIT}\nfrom .client import Client\n\n__all__ = ["Client"]\n`;
}

function pyproject(plan: ProjectionPlan): string {
  return (
    `[build-system]\n` +
    `requires = ["setuptools>=61"]\n` +
    `build-backend = "setuptools.build_meta"\n\n` +
    `[project]\n` +
    `name = ${JSON.stringify(plan.pyDist)}\n` +
    `version = ${JSON.stringify(plan.apiVersion)}\n` +
    `description = ${JSON.stringify(`${plan.title} Python SDK (generated)`)}\n` +
    `requires-python = ">=3.8"\n\n` +
    `[tool.setuptools.packages.find]\n` +
    `include = [${JSON.stringify(plan.pyModule + '*')}]\n`
  );
}

function readme(plan: ProjectionPlan): string {
  const res = plan.resources[0];
  const first = res?.ops[0];
  const example =
    res && first
      ? `from ${plan.pyModule} import Client\n\n` +
        `client = Client(token="...")\n` +
        `result = client.${res.prop}.${first.methodName}(${first.params
          .filter((p) => p.required)
          .map((p) => `${pySafeIdent(p.name)}=...`)
          .join(', ')})\n`
      : '# no operations';
  return (
    `# ${plan.title} — Python SDK\n\n` +
    `Generated from the connector IR. Base URL: \`${plan.server || '(set base_url)'}\`.\n\n` +
    '```python\n' +
    example +
    '```\n'
  );
}

const HTTP_PY = `# ${DO_NOT_EDIT}
from __future__ import annotations
import json
import urllib.request
import urllib.parse
from typing import Any, Optional


class HttpClient:
    def __init__(self, base_url: str, token: Optional[str] = None) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._token = token

    def request(
        self,
        method: str,
        path: str,
        query: Optional[dict] = None,
        body: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> Any:
        if not self._base_url:
            raise ValueError("base_url is required")
        url = self._base_url + path
        if query:
            clean = {k: v for k, v in query.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        hdrs = {"content-type": "application/json"}
        if headers:
            hdrs.update({k: str(v) for k, v in headers.items()})
        if self._token:
            hdrs["authorization"] = f"Bearer {self._token}"
        data = None
        if body is not None:
            clean_body = {k: v for k, v in body.items() if v is not None}
            data = json.dumps(clean_body).encode()
        req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
        with urllib.request.urlopen(req) as resp:  # noqa: S310
            text = resp.read().decode()
        return json.loads(text) if text else None
`;
