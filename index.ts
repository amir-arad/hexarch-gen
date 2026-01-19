#!/usr/bin/env bun
import { cruise, type ICruiseResult, type IModule } from "dependency-cruiser";
import { program } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, relative, basename } from "path";

// Types
type Layer = "domain" | "application" | "ports" | "inboundAdapters" | "outboundAdapters" | "infrastructure" | "unknown";

interface LayerConfig {
  patterns: RegExp[];
  markers: string[];
}

interface Config {
  layers: Record<Layer, LayerConfig>;
  rules: { from: Layer; toForbidden: Layer[] }[];
}

interface ClassifiedModule {
  source: string;
  layer: Layer;
  dependencies: { resolved: string; layer: Layer }[];
}

interface Violation {
  severity: "error" | "warn";
  rule: string;
  from: string;
  fromLayer: Layer;
  to: string;
  toLayer: Layer;
}

interface Analysis {
  modules: ClassifiedModule[];
  violations: Violation[];
  layerCounts: Record<Layer, number>;
}

// Default config
const defaultConfig: Config = {
  layers: {
    domain: {
      patterns: [/domain\/(?!ports)/, /entities/, /value-?objects/, /domain-?services/],
      markers: ["@hexagonal domain", "domain-entity"],
    },
    application: {
      patterns: [/application\//, /use-?cases/, /usecases/, /app-?services/],
      markers: ["@hexagonal application", "use-case"],
    },
    ports: {
      patterns: [/ports?\//, /interfaces?\//],
      markers: ["@hexagonal port", "Port$", "Interface$"],
    },
    inboundAdapters: {
      patterns: [/adapters?\/in/, /inbound/, /controllers?\//, /http\//, /graphql\//, /handlers?\//],
      markers: ["@hexagonal inbound-adapter", "Controller$", "Handler$", "Resolver$"],
    },
    outboundAdapters: {
      patterns: [/adapters?\/out/, /outbound/, /repositories\//, /persistence\//, /external-?apis?\//, /clients?\//],
      markers: ["@hexagonal outbound-adapter", "Repository$", "Client$", "Provider$"],
    },
    infrastructure: {
      patterns: [/infrastructure\//, /config\//, /di\//, /bootstrap/],
      markers: ["@hexagonal infrastructure"],
    },
    unknown: { patterns: [], markers: [] },
  },
  rules: [
    { from: "domain", toForbidden: ["application", "inboundAdapters", "outboundAdapters", "infrastructure"] },
    { from: "application", toForbidden: ["inboundAdapters", "outboundAdapters", "infrastructure"] },
    { from: "ports", toForbidden: ["application", "inboundAdapters", "outboundAdapters", "infrastructure"] },
    { from: "inboundAdapters", toForbidden: ["outboundAdapters"] },
  ],
};

// Layer classification order matters - more specific patterns first
const CLASSIFICATION_ORDER: Layer[] = ["inboundAdapters", "outboundAdapters", "ports", "application", "domain", "infrastructure"];

function classifyPath(path: string, config: Config): Layer {
  for (const layer of CLASSIFICATION_ORDER) {
    const { patterns, markers } = config.layers[layer];
    if (patterns.some((p) => p.test(path))) return layer;
    if (markers.some((m) => new RegExp(m).test(path))) return layer;
  }
  return "unknown";
}

function hasMarkerInSource(filePath: string, markers: string[]): boolean {
  try {
    const content = readFileSync(filePath, "utf-8").slice(0, 2000);
    return markers.some((m) => new RegExp(m).test(content));
  } catch {
    return false;
  }
}

function classifyModule(mod: IModule, srcRoot: string, config: Config): Layer {
  // Check markers in file content first (respecting classification order)
  for (const layer of CLASSIFICATION_ORDER) {
    const { markers } = config.layers[layer];
    if (hasMarkerInSource(mod.source, markers)) return layer;
  }
  return classifyPath(mod.source, config);
}

// Analysis
async function analyze(srcPath: string, config: Config): Promise<Analysis> {
  const tsConfigPath = join(dirname(srcPath), "tsconfig.json");
  const cruiseResult = await cruise([srcPath], {
    tsPreCompilationDeps: true,
    ...(existsSync(tsConfigPath) && { tsConfig: { fileName: tsConfigPath } }),
  }) as ICruiseResult;

  const output = cruiseResult.output as { modules: IModule[] };
  const modules: ClassifiedModule[] = output.modules.map((mod) => ({
    source: mod.source,
    layer: classifyModule(mod, srcPath, config),
    dependencies: (mod.dependencies || [])
      .filter((d) => !d.coreModule && d.resolved && !d.resolved.includes("node_modules"))
      .map((d) => ({
        resolved: d.resolved,
        layer: classifyPath(d.resolved, config),
      })),
  }));

  const violations: Violation[] = [];
  for (const mod of modules) {
    const rule = config.rules.find((r) => r.from === mod.layer);
    if (!rule) continue;
    for (const dep of mod.dependencies) {
      if (rule.toForbidden.includes(dep.layer)) {
        violations.push({
          severity: "error",
          rule: `${mod.layer}-cannot-import-${dep.layer}`,
          from: mod.source,
          fromLayer: mod.layer,
          to: dep.resolved,
          toLayer: dep.layer,
        });
      }
    }
  }

  const layerCounts = modules.reduce(
    (acc, m) => ({ ...acc, [m.layer]: (acc[m.layer] || 0) + 1 }),
    {} as Record<Layer, number>
  );

  return { modules, violations, layerCounts };
}

// Diagram generators
const LAYER_COLORS: Record<Layer, string> = {
  domain: "#4CAF50",
  application: "#2196F3",
  ports: "#9C27B0",
  inboundAdapters: "#FF9800",
  outboundAdapters: "#F44336",
  infrastructure: "#607D8B",
  unknown: "#9E9E9E",
};

const LAYER_ORDER: Layer[] = ["infrastructure", "inboundAdapters", "outboundAdapters", "ports", "application", "domain"];

function generateD2(analysis: Analysis): string {
  const lines: string[] = ["direction: down", ""];
  const byLayer = new Map<Layer, ClassifiedModule[]>();
  for (const mod of analysis.modules) {
    if (!byLayer.has(mod.layer)) byLayer.set(mod.layer, []);
    byLayer.get(mod.layer)!.push(mod);
  }

  for (const layer of LAYER_ORDER) {
    const mods = byLayer.get(layer);
    if (!mods?.length) continue;
    lines.push(`${layer}: {`);
    lines.push(`  style.fill: "${LAYER_COLORS[layer]}20"`);
    lines.push(`  style.stroke: "${LAYER_COLORS[layer]}"`);
    for (const mod of mods) {
      const name = basename(mod.source).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`  ${name}: "${basename(mod.source)}"`);
    }
    lines.push("}\n");
  }

  const seen = new Set<string>();
  for (const mod of analysis.modules) {
    const fromName = basename(mod.source).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
    for (const dep of mod.dependencies) {
      const toName = basename(dep.resolved).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
      const key = `${mod.layer}.${fromName} -> ${dep.layer}.${toName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isViolation = analysis.violations.some((v) => v.from === mod.source && v.to === dep.resolved);
      lines.push(`${key}${isViolation ? ": { style.stroke: red; style.stroke-width: 2 }" : ""}`);
    }
  }
  return lines.join("\n");
}

function generateDot(analysis: Analysis): string {
  const lines: string[] = [
    "digraph hexagonal {",
    '  rankdir=TB;',
    '  node [shape=box, style="rounded,filled"];',
    "",
  ];

  const byLayer = new Map<Layer, ClassifiedModule[]>();
  for (const mod of analysis.modules) {
    if (!byLayer.has(mod.layer)) byLayer.set(mod.layer, []);
    byLayer.get(mod.layer)!.push(mod);
  }

  let clusterIdx = 0;
  for (const layer of LAYER_ORDER) {
    const mods = byLayer.get(layer);
    if (!mods?.length) continue;
    lines.push(`  subgraph cluster_${clusterIdx++} {`);
    lines.push(`    label="${layer}";`);
    lines.push(`    style=filled;`);
    lines.push(`    color="${LAYER_COLORS[layer]}20";`);
    for (const mod of mods) {
      const id = mod.source.replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`    "${id}" [label="${basename(mod.source)}", fillcolor="${LAYER_COLORS[layer]}40"];`);
    }
    lines.push("  }\n");
  }

  for (const mod of analysis.modules) {
    const fromId = mod.source.replace(/[^a-zA-Z0-9]/g, "_");
    for (const dep of mod.dependencies) {
      const toId = dep.resolved.replace(/[^a-zA-Z0-9]/g, "_");
      const isViolation = analysis.violations.some((v) => v.from === mod.source && v.to === dep.resolved);
      lines.push(`  "${fromId}" -> "${toId}"${isViolation ? ' [color=red, penwidth=2]' : ""};`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function generateJSON(analysis: Analysis): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    layers: Object.fromEntries(
      LAYER_ORDER.map((l) => [l, {
        count: analysis.layerCounts[l] || 0,
        files: analysis.modules.filter((m) => m.layer === l).map((m) => m.source),
      }])
    ),
    violations: analysis.violations,
    metrics: {
      totalModules: analysis.modules.length,
      totalViolations: analysis.violations.length,
      architectureScore: Math.max(0, 100 - analysis.violations.length * 5),
    },
  }, null, 2);
}

// CLI
program
  .name("hexarch-gen")
  .description("Hexagonal architecture analyzer and diagram generator")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze codebase and generate diagrams")
  .argument("<src>", "Source directory to analyze")
  .option("-f, --format <formats>", "Output formats: d2,dot,json,svg", "d2,json")
  .option("-o, --output <dir>", "Output directory", "./hexarch-output")
  .option("-c, --config <path>", "Config file path")
  .action(async (src: string, opts: { format: string; output: string; config?: string }) => {
    const srcPath = join(process.cwd(), src);
    if (!existsSync(srcPath)) {
      console.error(chalk.red(`Source path not found: ${srcPath}`));
      process.exit(1);
    }

    let config = defaultConfig;
    if (opts.config && existsSync(opts.config)) {
      config = { ...defaultConfig, ...JSON.parse(readFileSync(opts.config, "utf-8")) };
    }

    console.log(chalk.blue("Analyzing..."), srcPath);
    const analysis = await analyze(srcPath, config);
    mkdirSync(opts.output, { recursive: true });
    const formats = opts.format.split(",");

    for (const fmt of formats) {
      const outPath = join(opts.output, `architecture.${fmt}`);
      switch (fmt.trim()) {
        case "d2": writeFileSync(outPath, generateD2(analysis)); break;
        case "dot": writeFileSync(outPath, generateDot(analysis)); break;
        case "json": writeFileSync(outPath, generateJSON(analysis)); break;
        case "svg":
          writeFileSync(join(opts.output, "architecture.dot"), generateDot(analysis));
          console.log(chalk.yellow("SVG: Run `dot -Tsvg architecture.dot -o architecture.svg`"));
          break;
      }
      console.log(chalk.green("✓"), outPath);
    }

    console.log(chalk.bold("\nLayer Summary:"));
    for (const [layer, count] of Object.entries(analysis.layerCounts)) {
      console.log(`  ${layer}: ${count} files`);
    }

    if (analysis.violations.length) {
      console.log(chalk.red(`\n${analysis.violations.length} violation(s):`));
      for (const v of analysis.violations.slice(0, 10)) {
        console.log(chalk.red("  ✗"), `${v.fromLayer} → ${v.toLayer}:`, basename(v.from), "→", basename(v.to));
      }
      if (analysis.violations.length > 10) console.log(`  ... and ${analysis.violations.length - 10} more`);
    } else {
      console.log(chalk.green("\n✓ No architecture violations found"));
    }
  });

program
  .command("validate")
  .description("Validate architecture rules (exit 1 on violations)")
  .argument("<src>", "Source directory")
  .option("-c, --config <path>", "Config file path")
  .option("--strict", "Treat warnings as errors")
  .action(async (src: string, opts: { config?: string; strict?: boolean }) => {
    const srcPath = join(process.cwd(), src);
    let config = defaultConfig;
    if (opts.config && existsSync(opts.config)) {
      config = { ...defaultConfig, ...JSON.parse(readFileSync(opts.config, "utf-8")) };
    }

    const analysis = await analyze(srcPath, config);
    if (analysis.violations.length) {
      console.log(chalk.red(`${analysis.violations.length} violation(s):`));
      for (const v of analysis.violations) {
        console.log(chalk.red("  ✗"), `[${v.rule}]`, relative(srcPath, v.from), "→", relative(srcPath, v.to));
      }
      process.exit(1);
    }
    console.log(chalk.green("✓ Architecture is valid"));
  });

program.parse();
