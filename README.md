# hexarch-gen

CLI tool that analyzes TypeScript codebases for hexagonal architecture patterns and generates diagrams.

## Install

```bash
bun install
```

## Usage

```bash
# Analyze and generate diagrams
bun run index.ts analyze ./src -f d2,dot,json -o ./diagrams

# Validate architecture (exits 1 on violations - for CI)
bun run index.ts validate ./src
```

## Output Formats

| Format | Description |
|--------|-------------|
| `d2` | [D2](https://d2lang.com) diagram language |
| `dot` | GraphViz (run `dot -Tsvg file.dot -o file.svg`) |
| `json` | Analysis data with metrics |

## Layer Detection

Classifies files by path patterns and source markers:

- `domain/`, `entities/` → **domain**
- `application/`, `use-cases/` → **application**  
- `ports/` → **ports**
- `controllers/`, `http/` → **inboundAdapters**
- `repositories/`, `persistence/` → **outboundAdapters**
- `infrastructure/`, `config/` → **infrastructure**

Or use JSDoc markers: `/** @hexagonal domain */`

## Architecture Rules

```
domain        → cannot import → application, adapters, infrastructure
application   → cannot import → adapters, infrastructure
ports         → cannot import → application, adapters, infrastructure
inboundAdapters → cannot import → outboundAdapters
```

## License

MIT
