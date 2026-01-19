# Product Primer: hexarch-gen

## What It Is

A CLI/programmatic tool that scans TypeScript/Node.js codebases, automatically detects hexagonal architecture patterns, and generates visual diagrams with architecture compliance validation.

## Problem Statement

- Developers following hexagonal architecture must manually maintain diagrams or use generic visualization tools that don't understand ports/adapters/domain semantics
- No automated tool exists that scans TypeScript codebases and specifically highlights hexagonal architecture layers
- Architecture compliance can drift undetected

## Target Audience

- Software engineers building hexagonal architecture applications
- Architecture-focused teams wanting to visualize and enforce clean architecture patterns
- Organizations using TypeScript/Node.js with hexagonal architecture (e.g., Khalil Stemmler's clean architecture pattern)

## Core Capabilities

### 1. Automatic Layer Detection

Classifies files/modules into hexagonal layers:

| Layer | Contents |
|-------|----------|
| **Domain** | Entities, Value Objects, Domain Services, Domain Events |
| **Application** | Use Cases, Application Services, DTOs, Orchestration |
| **Ports** | Inbound ports (use case interfaces), Outbound ports (dependency interfaces) |
| **Inbound Adapters** | HTTP controllers, GraphQL resolvers, CLI handlers, Message listeners |
| **Outbound Adapters** | Database repositories, External API clients, Cache implementations |
| **Infrastructure** | Configuration, DI setup, Bootstrapping, Middleware |

### 2. Detection Strategy (3-tier)

1. **Path patterns** (primary): `domain/`, `application/`, `adapters/in/`, `adapters/out/`
2. **JSDoc markers** (secondary): `/** @hexagonal domain-entity */`
3. **Dependency analysis** (tertiary): Interface implementations, classes with no external deps

### 3. Dependency Validation

Enforces hexagonal architecture rules:
- ❌ Domain must NOT import from Infrastructure, Adapters, Application
- ❌ Application must NOT import from Adapters, Infrastructure
- ❌ Ports must NOT import from implementations
- ❌ Inbound adapters must NOT directly depend on outbound adapters
- ✅ Adapters can import Domain, Ports, Application
- ✅ Infrastructure can import everything (glue layer)

### 4. Diagram Generation

Visual output showing layer relationships and dependencies in multiple formats (D2, DOT, SVG, PlantUML, JSON).

## Success Metrics

- Detects 95%+ of architecture violations in test codebases
- Generates diagrams in <500ms for projects <1000 files
- Zero false positives for standard hexagonal patterns
- Integrable into CI/CD pipelines

## Conceptual Diagram

```
┌─────────────────────────────────────────────┐
│   Infrastructure / Framework Layer          │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ HTTP Adapter │  │ DB Adapter       │    │
│  │ Controllers  │  │ Repositories     │    │
│  └──────┬───────┘  └────────┬─────────┘    │
└─────────┼──────────────────┼───────────────┘
          │                  │
    ┌─────▼──────────────────▼──────┐
    │   Ports (Interfaces)          │
    │ ┌──────────┐  ┌──────────┐    │
    │ │ UseCase  │  │ Database │    │
    │ │ Ports    │  │ Ports    │    │
    │ └────┬─────┘  └────┬─────┘    │
    └──────┼─────────────┼──────────┘
           │             │
    ┌──────▼─────────────▼──────┐
    │   Application Layer       │
    │ ┌─────────────────────┐   │
    │ │ Use Cases / Services │   │
    │ │ (Orchestrators)      │   │
    │ └────────┬─────────────┘   │
    └──────────┼─────────────────┘
               │
         ┌─────▼───────────┐
         │  Domain Layer   │
         │ ┌─────────────┐ │
         │ │ Entities    │ │
         │ │ Business    │ │
         │ │ Logic       │ │
         │ └─────────────┘ │
         └─────────────────┘
```

## Future Vision (Out of Scope V1)

- Java/Spring Boot support
- Metrics dashboard (coupling, cohesion, architecture health)
- IDE extensions (VS Code)
- Web UI for visualization
- Refactoring suggestions
- Architecture evolution tracking
