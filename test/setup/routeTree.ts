import type { FastifyInstance } from 'fastify';

export interface RegisteredRoute {
  method: string;
  url: string;
}

const INDENT_UNIT_LENGTH = 4;
const TREE_LINE = /^([│ ]*)(├── |└── )(.*)$/u;
const LABEL_AND_METHODS = /^(.*?)(?:\s+\(([^)]*)\))?$/u;

// Fastify auto-registers a HEAD alongside every GET, and @fastify/cors
// registers a wildcard OPTIONS route for preflight -- neither is a domain
// route the OpenAPI document is expected to describe.
const IGNORED_METHODS = new Set(['HEAD', 'OPTIONS']);

interface ParsedLine {
  depth: number;
  label: string;
  methods?: string;
}

interface StackFrame {
  depth: number;
  path: string;
}

/** Matches one tree line, or returns null for a line that carries no route (e.g. the trailing blank line). */
function matchTreeLine(line: string): ParsedLine | null {
  const lineMatch = TREE_LINE.exec(line);
  if (!lineMatch) return null;

  const [, indent, , rest] = lineMatch;
  const depth = indent!.length / INDENT_UNIT_LENGTH;
  const labelMatch = LABEL_AND_METHODS.exec(rest!);
  return { depth, label: labelMatch?.[1] ?? rest!, methods: labelMatch?.[2] };
}

/** Pops every frame at or deeper than `depth`, leaving the current line's parent on top. */
function popToDepth(stack: StackFrame[], depth: number): void {
  while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
    stack.pop();
  }
}

/** Appends one {method, url} entry per real HTTP method a tree node declares. */
function recordRoutes(routes: RegisteredRoute[], url: string, methods: string | undefined): void {
  if (!methods) return;
  for (const method of methods.split(',').map((raw) => raw.trim())) {
    if (method.length > 0 && !IGNORED_METHODS.has(method)) {
      routes.push({ method, url });
    }
  }
}

/**
 * Parses the tree Fastify's own `printRoutes({ commonPrefix: false })`
 * produces into a flat list of {method, url} pairs. Fastify merges shared
 * path segments into a single branch, so a node's full URL is the
 * concatenation of every ancestor's label down to the root -- this walks
 * that tree with a depth stack to reconstruct it.
 */
export function parseRouteTree(tree: string): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const stack: StackFrame[] = [];

  for (const line of tree.split('\n')) {
    const parsed = matchTreeLine(line);
    if (!parsed) continue;

    popToDepth(stack, parsed.depth);
    const parentPath = stack.length > 0 ? stack[stack.length - 1]!.path : '';
    const path = parentPath + parsed.label;
    stack.push({ depth: parsed.depth, path });

    recordRoutes(routes, path, parsed.methods);
  }

  // A real app always registers at least one route (health check alone
  // guarantees that). Zero here means this parser no longer recognizes
  // Fastify's tree format -- surface that directly rather than letting it
  // masquerade as "the document is missing every path".
  if (routes.length === 0) {
    throw new Error("parseRouteTree matched no routes; Fastify's printRoutes() tree format may have changed");
  }

  return routes;
}

/** Reads Fastify's actual, already-registered routing table for an app that has completed `.ready()`. */
export function listRegisteredRoutes(app: FastifyInstance): RegisteredRoute[] {
  return parseRouteTree(app.printRoutes({ commonPrefix: false }));
}
