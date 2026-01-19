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
