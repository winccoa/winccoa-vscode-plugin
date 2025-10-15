import net from 'node:net';
import {
  createConnection,
  InitializeParams,
  TextDocuments,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  InitializeResult,
  Hover,
  MarkupKind,
  integer,
  Range,
  Position
} from 'vscode-languageserver/node';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { config } from 'node:process';
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import path from 'node:path';
import { WinccoaSysConEvent, WinccoaSysConDpDetails } from 'winccoa-manager';

// Index types
type DpName = string;
type DpePath = string;
interface ModelIndex {
  dps: Set<DpName>;
  cns: Set<DpName>;
  dpes: Map<DpName, Set<DpePath>>;
}
// TODO: Add -dbg parameter to all the echos
// DONE? TODO: add these parameters to general properties of the extension so that they can be configured by the user

function getArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

const url = getArg('-url') ?? '127.0.0.1:2087';
const HOST = url.split(":")[0];
const PORT: number = + url.split(":")[1];

//const clients = new Set();
//console.log(`Starting server on ${HOST}:${PORT}`);
//const isChild = process.argv.includes('--child');
// if (isChild) {
// Start a TCP server that accepts multiple clients.
  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true);
    console.log(`Starting server on ${HOST}:${PORT}`);
    const reader = new StreamMessageReader(socket);
    const writer = new StreamMessageWriter(socket);
  
    // Each socket gets its own LSP connection and server state.
    const connection = createConnection(reader, writer);

    //for child server
    //const connection = createConnection(process.stdin, process.stdout);
    const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    // In-memory model
    const model: ModelIndex = { dps: new Set(), dpes: new Map(), cns: new Set() };
  
    // Identify DPEs (leafs in the tree) with existing original value config
    let initQuery = "SELECT '_original.._type' FROM '*.**'";
  
    // Attempt to load winccoa-manager dynamically
    function requireWinccoaSafe(): any | undefined {
      try {
        // Prefer require as recommended in WinCC OA docs
        // It helps when modules are located in sub-projects or installation paths.
        // See docs note about require vs import.
        // If not available, this will throw.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const winccoa = require('winccoa-manager');
        console.log('Successfully loaded winccoa-manager');
        return winccoa;
      } catch (_e) {
        console.log('Failed to load winccoa-manager:', _e);
        return undefined;
      }
    }
  
    async function buildIndexFromWinccoa(winccoa: any, query: string) {
      const mgr = new winccoa.WinccoaManager();
      try {
        console.log('Building index with query:', query);
        // Initial table
        const table = await mgr.dpQuery(query);
        //console.log('dpQuery returned table with', Array.isArray(table) ? table.length : 'no', 'rows');
        
        if (Array.isArray(table)) {
          // table like: [ ["",":_original.._value"], ["System1:DP1.", 2.34], ... ]
          for (let i = 1; i < table.length; i++) {
            const line = table[i];
            const name = String(line[0] ?? '').replace(/\s+/g, '');
            if (!name) continue;
            
            //console.log('Processing name:', name);
            
            // Parse the name properly: handle system:dp.dpe format
            let dp: string;
            let dpe: string | undefined;
            
            // First check for colon (system separator)
            //const colonPos = name.indexOf(':');
            //let nameWithoutSystem = colonPos > 0 ? name.substring(colonPos + 1) : name;
            
            // Then check for dot (DP/DPE separator)
            const dotPos = name.indexOf('.');
            if (dotPos > 0) {
              dp = name.substring(0, dotPos);
              dpe = name.substring(dotPos + 1);
            } else {
              dp = name;
            }
            
            //console.log('Parsed - DP:', dp, 'DPE:', dpe);
            
            model.dps.add(dp);
  
            if (dpe) {
              if (!model.dpes.has(dp)) model.dpes.set(dp, new Set());
              const set = model.dpes.get(dp)!;
              set.add(dpe);
            }
          }
        }
        
        console.log('Index built - DPs:', model.dps.size, 'Total DPEs:', Array.from(model.dpes.values()).reduce((sum, set) => sum + set.size, 0));
  
        // Live updates to keep the index fresh
        // TODO: check if a system-event for DpIdentification isn't better here to avoid a huge query-connect
        // DONE? -> realized with WinccoaSysConEvent
        // try {
          // mgr.dpQueryConnectSingle(
            // (values: unknown[][], _type: number, _error?: any) => {
              // if (Array.isArray(values)) {
                // for (let i = 1; i < values.length; i++) {
                //   const name = String(values[i][0] ?? '').replace(/\s+/g, '');
                //   if (!name) continue;
                //   const dp = name.endsWith('.') ? name.slice(0, -1) : name;
                //   model.dps.add(dp);
                //   if (!model.dpes.has(dp)) model.dpes.set(dp, new Set(['_original.._value','_online.._value']));
                // }
              // }
            // },
            // true,
            // query
          // );
        // } catch (e) {
          // non-fatal for starter
          // console.error('dpQueryConnectSingle failed: ' + e);
        // }
      } catch (e) {
        connection.console.error('dpQuery failed: ' + e);
      }
  
      //DONE? TODO: build index for CNS tree (mind format of sys.view:tree => if first dot comes before colon, then it's CNS)
      // TODO group it like dps
      const sysname = mgr.getSystemName();
      const views = mgr.cnsGetViews(sysname.replace(':', '')); //replace the ":" after systemname for cns views
      console.log("Views: " + views);
      for (const view of views)
      {
        const trees = await mgr.cnsGetTrees(view);
        console.log('Trees:', trees);
        for (const tree of trees) {
          await traverseTree(mgr, tree, model);
        }
      }
      // TODO: build index for message-catalogs and script files
    }
  
    connection.onInitialize(async (params: InitializeParams) => {
      console.error('onInitialize called');
      const opts = (params.initializationOptions as any) || {};
      initQuery = typeof opts.query === 'string' && opts.query.trim() ? opts.query : initQuery;
      const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
      const result: InitializeResult = {
        capabilities: {
          textDocumentSync: 1,
          completionProvider: {
            triggerCharacters: ['.', ':', '_', "\"", "'", "´"] //, ...letters
          },
          hoverProvider: true
        }
      };
  
      // Build index
      const winccoa = requireWinccoaSafe();
      await buildIndexFromWinccoa(winccoa, initQuery);
      console.error('Returning InitializeResult');
      return result;
    });

    // IMPORTANT: wait until initialization completes
    connection.onInitialized(() => {
     console.log('[Child] Connection initialized, attaching DB listener');
    
     // Attach your project-specific DB listener here
     // This function will be called whenever the DB changes
     const winccoa = requireWinccoaSafe();
     const mgr = new winccoa.WinccoaManager();
     mgr.sysConnect.on(winccoa.WinccoaSysConEvent.DpCreated, dpCreatedListener);

    });

    function dpCreatedListener(details: WinccoaSysConDpDetails) {
      console.log('DP created - details:');
      console.log(details);
      const winccoa = requireWinccoaSafe();
      buildIndexFromWinccoa(winccoa, initQuery);
    }
  
    // Simple request to allow reloading index
    connection.onRequest('workspace/reloadIndex', async () => {
      model.dps.clear(); model.dpes.clear();
      const winccoa = requireWinccoaSafe();
      await buildIndexFromWinccoa(winccoa, initQuery);
      return true;
    });
  
    // Completion: offer names/paths from index
    connection.onCompletion((_pos: TextDocumentPositionParams): CompletionItem[] => {
      console.log('Completion requested at position:', _pos.position);
      const items: CompletionItem[] = [];
      const doc = documents.get(_pos.textDocument.uri);
      if (!doc) {
        console.log('No document found for URI:', _pos.textDocument.uri);
        return items;
      }
      const text = doc.getText();
      const offset = doc.offsetAt(_pos.position);
      const start = Math.max(0, offset - 128);
      const context = text.slice(start, offset);
      console.log('Completion context:', JSON.stringify(context));
      
      const lineText = doc.getText({
        start: { line: _pos.position.line, character: 0 },
        end: _pos.position
      });
      //watch if a cns or dp function is written
      const match = lineText.match(/\.(?:[A-Za-z0-9_]*?(?:cns|dp)[A-Za-z0-9_]*)\(\s*["'´]([^"'´]*)$/im);
      console.log('Searching for:', match);
      if (match) {
        const dpObject = match[1];
        console.log("Search string for autocomplete:", dpObject);
        // use searchString to filter model.cns etc.
        //check cns trees
        
        console.log('Available CNS:', Array.from(model.cns));
        const matchingCns = Array.from(model.cns).filter(cns => cns.startsWith(dpObject));
        for (const cns of matchingCns) {
         console.log("push " + cns + " in context menu");
         items.push({
           label: cns,
           kind: CompletionItemKind.Variable,
           insertText: removeBasePrefix(dpObject, cns),
         });
        }
  
        if (!dpObject) {
          //initial dp list
          const matchingDps = Array.from(model.dps).filter(dp => dp.startsWith(dpObject));
          for (const dp of matchingDps) {
                items.push({ 
                  label: dp, 
                  kind: CompletionItemKind.Variable,
                  insertText: removeBasePrefix(dpObject, dp) // Only insert the remaining part
                });
          }
        }
  
        // Parse the current typing context for DpIdentification syntax
        const matchdp = dpObject.match(/^([A-Za-z0-9]+(?::[A-Za-z0-9_]*)?)([\.A-Za-z0-9_]+?)?$/i); // old /^([A-Za-z_][\w\d]*(?::[A-Za-z_][\w]*)?)(\..*)?$/i
        console.log('Regex match result:', matchdp);
        if (matchdp) {
          const typedDp = matchdp[1];
          const typedDpe = matchdp[2];
          console.log('Typed DP:', typedDp, 'Typed DPE:', typedDpe);
          
          // Check if we have an exact DP match and a dot (suggesting DPE completion)
          if (typedDpe && model.dps.has(typedDp)) {
            // Complete DPE names for the exact DP
            const elements = model.dpes.get(typedDp);
            console.log('Found elements for exact DP', typedDp, ':', elements ? Array.from(elements) : 'none');
            
            if (elements) {
              const dpePrefix = typedDpe.substring(1); // Remove the leading dot 
              for (const e of elements) {
                if (e.startsWith(dpePrefix)) { 
                  var b = e;
                  if (dpePrefix.indexOf(".") > 0) {b = e.substring(dpePrefix.indexOf(".")) }
                  console.log("new dpe " + b);
                  items.push({ 
                    label: b, 
                    kind: CompletionItemKind.Field,
                    insertText: removeBasePrefix(dpObject, e) // Only insert the remaining part
                  });
                }
              }
            }
          } else {
            // Look for DP name matches (exact or prefix)
            console.log('Looking for DP matches for:', typedDp, 'Available DPs:', Array.from(model.dps));
            
            // First try exact match (for when typing DPE after complete DP name)
            if (model.dps.has(typedDp)) {
              const elements = model.dpes.get(typedDp);
              console.log('Found elements for exact DP', typedDp, ':', elements ? Array.from(elements) : 'none');
              
              if (elements) {
                for (const e of elements) {
                  items.push({ label: e, kind: CompletionItemKind.Field });
                }
              }
            } else {
              // Try prefix matching for DP names
              const matchingDps = Array.from(model.dps).filter(dp => dp.startsWith(typedDp));
              console.log('Found matching DPs by prefix:', matchingDps);
              
              for (const dp of matchingDps) {
                items.push({ 
                  label: dp, 
                  kind: CompletionItemKind.Variable,
                  insertText: removeBasePrefix(dpObject, dp) // Only insert the remaining part
                });
                
                // Also add some common DPE elements for each matching DP
                // const elements = model.dpes.get(dp);
                // if (elements) {
                  // console.log('Found elements ', elements);
                  //Add a few common elements to give users a preview
                  // const commonElements = Array.from(elements).slice(0, 5);
                  // for (const e of commonElements) {
                    // console.log(`add element to list ${dp} replace with ${dpObject} then .${e}`)
                    // items.push({ 
                      // label: `${dp}.${e}`, 
                      // kind: CompletionItemKind.Field,
                      // insertText: `${dp.replace(dpObject, "")}.${e}`,
                      // detail: `${dp} element`
                    // });
                  // }
                // }
              }
            }
          }
        }
      } else {
        console.log('No regex match for completion context');
      }
      console.log('Returning', items.length, 'completion items');
      return items;
    });
  
    // Hover: describe either DP or DPE
    connection.onHover((params): Hover | undefined => {
      const doc = documents.get(params.textDocument.uri);
      if (!doc) return undefined;
      const text = doc.getText();
      const offset = doc.offsetAt(params.position);
      const start = Math.max(0, offset - 128);
      const context = text.slice(start, offset);
      const wordMatch = context.match(/([A-Za-z_][\w]*)(?:\.([\w\.]+))?$/);
      if (!wordMatch) return undefined;
      const dp = wordMatch[1];
      const rest = wordMatch[2];
  
      // TODO: provide tooltip for correct context: DP description for DPEs, documented help for Config/Attr, Display name for CNS path, full path for cat/ctl files
      if (model.dps.has(dp)) {
        if (rest) {
          const elements = model.dpes.get(dp);
          if (elements && elements.has(rest)) {
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: `WinCC OA element: \`${dp}.${rest}\`\n\n- example attr: _original.._value`
              }
            };
          }
        }
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `WinCC OA data point: \`${dp}\``
          }
        };
      }
      return undefined;
    });
  
    documents.listen(connection);
    // Optional: clean up on socket end/close
    const close = () => {
      try {
        connection.dispose();
      } catch {}
      try {
        socket.destroy();
      } catch {}
    };
    // TODO: allow reconnecting clients so that server remains running instead of shutting down on editor close
    // for now done with node server on always, if server stop, client reconnect during runtime
    socket.on('error', () => close());
    socket.on('close', () => close());
    socket.on('end', () => close());
    connection.listen();
  // for child server
  //   
  //     documents.listen(connection);
  // connection.listen();

  // process.stdin.on('end', () => {
  //   console.error('[Child] stdin ended, exiting');
  //   process.exit(0);
  // });

  });

  server.on('error', (err) => {
    console.error('LS socket server error:', err);
    process.exitCode = 1;
  });

  server.listen(PORT, HOST, () => {
    console.log(`LSP server listening on ${HOST}:${PORT}`);
  });

  async function traverseTree(mgr: any, node: string, model: ModelIndex): Promise<void> {
    const children = await mgr.cnsGetChildren(node);
    console.log(`Children of ${node}:`, children);
    // If there are NO children, this is a leaf node
    //    if (children.length === 0) {
      console.log(`Added last child in line: ${node}`);
      model.cns.add(node);
    //      return; // stop recursion here
    //    }
    // If there are children, recurse into each one
    for (const child of children) {
      await traverseTree(mgr, child, model);
    }
  }

  function removeBasePrefix(base: string, target: string, separators: string[] = [":", ".", "/"]): string {
    // Find the last separator in base
    let lastIndex = -1;
    for (const sep of separators) {
      const idx = base.lastIndexOf(sep);
      if (idx > lastIndex) lastIndex = idx;
    }
  
    // No separator found — nothing to remove
    if (lastIndex === -1) return target;
  
    // Extract prefix without the separator
    const prefix = base.substring(0, lastIndex +1);
  
    // Remove the prefix from the target (if it starts with it)
    return target.startsWith(prefix) ? target.substring(prefix.length) : target;
  }
// } else {
//   // ----------------------
//   // MAIN TCP SERVER
//   // ----------------------node 
//   const server = net.createServer((socket) => {
//     console.log('Client connected:', socket.remoteAddress, socket.remotePort);

//     // Spawn a new child process for each client
//     console.log("My file: " + __filename)
//     console.log("process.execPath: " + process.execPath);
//     console.log("path.dirname(__filename) " + path.dirname(__filename));
//     console.log('[Parent] Spawning:', process.execPath, ["--inspect",
//                                                          "--",
//                                                          "C:\\Program Files\\Siemens\\WinCC_OA\\3.21\\javascript\\winccoa-manage\\lib\\bootstrap.js",
//                                                          "-PROJ",
//                                                          "testVSPlugin",
//                                                          "-pmonIndex 9",
//                                                          "-num 2",
//                                                          __filename,
//                                                           "--child" ]);
//     const child = spawn(process.execPath, [ "--inspect",
//                                             "--",
//                                             "C:\\Program Files\\Siemens\\WinCC_OA\\3.21\\javascript\\winccoa-manage\\lib\\bootstrap.js",
//                                             "-PROJ",
//                                             "testVSPlugin",
//                                             "-pmonIndex 9",
//                                             "-num 2",
//                                             __filename,
//                                              "--child" ], { //"--child", "-url " + HOST +":" + PORT
//       stdio: ["pipe", "pipe", "inherit"],
//       cwd: path.dirname(__filename),
//     });

//     // Connect client socket to child process
//     child.on('exit', (code, signal) => console.error(`[Parent] Child exited ${code} ${signal}`));
//     socket.pipe(child.stdin!);
//     child.stdout!.pipe(socket);
//     //child.stderr!.pipe(process.stderr);

//     // Handle client disconnect
//     socket.on('close', () => {
//       console.log('Client disconnected, killing child process.');
//       child.kill();
//     });

//     socket.on('error', (err) => {
//       console.error('Socket error:', err.message);
//       child.kill();
//     });
//   });

//   server.listen(PORT, HOST, () => {
//     console.log(`TCP server listening on ${HOST}:${PORT}`);
//   });
// }
