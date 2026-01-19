# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
bun install                          # Install dependencies
bun run index.ts analyze ./src       # Analyze a directory
bun run index.ts validate ./src      # Validate (exits 1 on violations)
bun run tsc --noEmit                 # Type check
```

## Project Overview

hexarch-gen is a CLI tool that analyzes TypeScript codebases for hexagonal architecture patterns and generates diagrams. It uses dependency-cruiser to parse dependencies and classifies files into hexagonal layers.

## Architecture

Single-file implementation (`index.ts`) organized into sections:

1. **Types** (lines 8-40): Layer type union, Config, ClassifiedModule, Violation, Analysis interfaces
2. **Layer Classification** (lines 82-107): Classifies files by path patterns and JSDoc markers in priority order
3. **Analysis Engine** (lines 110-153): Uses dependency-cruiser to build module graph, applies architecture rules
4. **Diagram Generators** (lines 168-261): D2, DOT (GraphViz), and JSON output formatters
5. **CLI** (lines 264-347): Commander-based CLI with `analyze` and `validate` commands

## Hexagonal Layers

Classification order (checked first wins): inboundAdapters → outboundAdapters → ports → application → domain → infrastructure

Dependency rules enforced:
- domain cannot import application, adapters, or infrastructure
- application cannot import adapters or infrastructure
- ports cannot import application, adapters, or infrastructure
- inboundAdapters cannot import outboundAdapters

---

## Product Specification (Target State)

### Target Programmatic API

```typescript
import { HexagonalAnalyzer, DiagramGenerator } from 'hexarch-gen';

const analyzer = new HexagonalAnalyzer('./src');
const analysis = await analyzer.analyze();
const violations = analysis.validateRules();

const generator = new DiagramGenerator(analysis);
const svgDiagram = await generator.generateSVG();
const d2Code = await generator.generateD2();
await generator.export('./output/diagram.svg', 'svg');
```

### Target CLI

```bash
hexarch-gen analyze ./src --format svg,d2,json --output-dir ./diagrams
hexarch-gen validate ./src --strict
hexarch-gen watch ./src --format svg   # Watch mode (not implemented)
```

### Target Output Formats

| Format | Status | Description |
|--------|--------|-------------|
| D2 | ✅ Implemented | Text-based diagram language |
| DOT | ✅ Implemented | GraphViz format |
| JSON | ✅ Implemented | Analysis data (basic) |
| SVG | ❌ Not implemented | Interactive, clickable nodes |
| PlantUML | ❌ Not implemented | Component diagrams |

### Target Configuration Schema (hexarch.config.json)

```json
{
  "sourceRoot": "./src",
  "layerDefinitions": {
    "domain": { "paths": ["src/domain/**"], "markers": ["@hexagonal domain"] },
    "ports": { "paths": ["src/domain/ports/**"], "markers": ["@hexagonal port"] },
    "inboundAdapters": { "paths": ["src/adapters/in/**"], "markers": ["Controller"] },
    "outboundAdapters": { "paths": ["src/adapters/out/**"], "markers": ["Repository"] }
  },
  "rules": {
    "domainIsolation": true,
    "noCyclicDependencies": true,
    "allowedImportsMatrix": { "domain": [], "application": ["domain", "ports"] }
  },
  "output": { "formats": ["svg", "d2"], "theme": "dark" }
}
```

### Unimplemented Features

- **Programmatic API exports**: No `HexagonalAnalyzer`/`DiagramGenerator` classes exported
- **SVG generation**: Currently outputs DOT only; user must run `dot -Tsvg` manually
- **PlantUML output**
- **Watch mode**: `hexarch-gen watch` command
- **Port sub-classification**: Distinguish inbound vs outbound ports
- **Rich JSON metrics**: modularity, coupling scores, adapter types
- **Interactive SVG**: Clickable nodes linking to source files, tooltips
- **Incremental analysis/caching**: For watch mode performance

### Detection Strategy (3-tier)

1. **Path patterns** (primary): `domain/`, `application/`, `adapters/in/`, etc.
2. **JSDoc markers** (secondary): `/** @hexagonal domain-entity */`
3. **Dependency analysis** (tertiary, not implemented): Detect interface implementations, classes with no external deps
