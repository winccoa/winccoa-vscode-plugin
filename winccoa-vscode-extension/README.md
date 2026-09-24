# WinCC OA Scripting Assistant for VS Code

Enhanced scripting support for WinCC OA projects inside Visual Studio Code. This extension provides:
- In-editor IntelliSense for WinCC OA JavaScript/TypeScript/CTL code that uses the official `winccoa-manager` API.
- Context-aware code completion for your project’s data model (Datapoints and Plant Model / CNS).
- Mouse-hover details (description, unit, live/current value) for datapoints and elements.
- A language server that runs as a WinCC OA JavaScript Manager to access the live project context.

> Why run a language server inside WinCC OA? Because the server connects to EVENT/DATA like any other manager and can therefore “see” the same project image you work with, enabling accurate, live-aware completions and hovers.

## How it works

- The extension starts a Language Server implemented with Node.js and the official WinCC OA JavaScript Manager. The server uses the `winccoa-manager` package to connect as a manager to your running project, so it can enumerate datapoints, resolve CNS paths, and read metadata/values for hover information.
- Completion triggers on `winccoa-manager` API usage (e.g., when typing addresses for data access) and offers:
  - Datapoint names and elements from the project
  - Plant Model (CNS) nodes and paths
- Hover shows enriched information retrieved from WinCC OA at the moment of inspection (e.g., description, engineering unit, current value).

## Prerequisites

- WinCC OA 3.21 or newer (the extension is designed around the JavaScript Manager and the `winccoa-manager` package).
- A running WinCC OA project that the language server can join as a manager.
- Node.js (installed with your WinCC OA setup for the JavaScript Manager).
- Visual Studio Code 1.80+

## Related official documentation

- [WinCC OA JavaScript Manager](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/index.html) — concepts, architecture, startup
- Using the `WinccoaManager` class from the `winccoa-manager` package
  - [NodeJS Basic configuration](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/NodeJS/topics/nodejs_basic_configuration.html)
  - [API index](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/apis/winccoa-manager/index.html)

## Installation

1. Install this extension from the VS Code Marketplace or via the VSIX file.
2. Build the language server (see [Building the language server](#building-the-language-server)).
3. Add a JavaScript manager using the server.js to your WinCC OA project for running the language server.
4. Open your projects javascript sub-folder in VS Code.
5. When prompted, allow the extension to start its language server.

## Building the language server

The language server is located in the `winccoa-languageserver/javascript/` folder. It is written in TypeScript and must be compiled to JavaScript before it can be used as a WinCC OA JavaScript Manager.

> Use `npm ci` instead of `npm install`. `npm ci` installs the exact dependency versions recorded in `package-lock.json`.

```bash
# Navigate to the language server folder
cd winccoa-languageserver/javascript

# Install dependencies (exact versions from the lock file)
npm ci

# Compile TypeScript to JavaScript
npm run compile
```

The compiled output is written to the same folder as `server.js` (defined as `main` in `package.json`). Deploy that file and the `node_modules` folder to your WinCC OA project's JavaScript Manager path.

## Features in detail

- Code completion
  - Datapoints and elements (DP/DPE) from the project
  - CNS paths resolved from the Plant Model (views, nodes, DPEs)
  - Context-aware address suggestions when editing `winccoa-manager` API calls
- Hover information
  - Description and unit (engineering unit) where available
  - Current value (live read) at the time of hover
  - Additional metadata (e.g., data type) when available

Note: The server queries the live project. If a value or configuration changes in WinCC OA, tooltips and suggestions will reflect those changes the next time data is requested.

## Configuration

Open VS Code Settings and search for “WinCC OA”:

- Host: Host name or IP address of the WinCC OA language server to connect (default: localhost).
- Port: Port number of the language server to connect (default: 2087).

## Typical workflow

1. Open a TypeScript or JavaScript file that uses `winccoa-manager`.
2. Start typing an address for data access; completion lists will suggest DP/DPEs and CNS nodes.
3. Hover any recognized address to view description/unit/value.
4. Use Fix-its to correct unknown/invalid paths discovered by diagnostics.
