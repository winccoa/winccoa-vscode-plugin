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
} from 'vscode-languageserver/node';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WinccoaSysConDpDetails, WinccoaElementType } from 'winccoa-manager';
import { dpConfigAttributes } from './wincc_oa_dpconfigs';

// Index types
type DpName = string;
interface ModelIndex {
  dps: Set<DpName>;
  cns: Map<string, Map<string, string>>;
  dpes: Map<DpName, Map<string, string>>;
  views: Set<string>;
  sys: Set<string>;
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
//console.log(`Starting server on ${HOST}:${PORT}`);

// Start a TCP server that accepts multiple clients.
const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  socket.setKeepAlive(true);
  console.log(`Starting server on ${HOST}:${PORT}`);
  const reader = new StreamMessageReader(socket);
  const writer = new StreamMessageWriter(socket);

  // Each socket gets its own LSP connection and server state.
  const connection = createConnection(reader, writer);
  //const connection = createConnection(process.stdin, process.stdout);
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
  // In-memory model
  const model: ModelIndex = { dps: new Set(), dpes: new Map(), cns: new Map(), sys: new Set(), views: new Set() };

  // Identify DPEs (leafs in the tree) with existing original value config
  // DONE? TODO elememt den typ hinzufügen
  // DONE? TODO CNS display name hinzufügen
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
        // console.log('Successfully loaded winccoa-manager');
        return winccoa;
      } catch (_e) {
        console.error('Failed to load winccoa-manager:', _e);
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
        for (let i = 1; i < table.length; i++) {
          const line = table[i];
          const name = String(line[0] ?? '').replace(/\s+/g, '');
          if (!name) continue;
          
          //console.log('Processing name:', name);
          
          // Parse the name properly: handle system:dp.dpe format
          let dp: string;
          let dpe: string | undefined;
          
          // First check for colon (system separator)
          const colonPos = name.indexOf(':');
          let nameWithoutSystem = colonPos > 0 ? name.substring(colonPos + 1) : name;
          //make it possible to add more systems
          model.sys.add(name.substring(0, colonPos))
          
          // Then check for dot (DP/DPE separator)
          const dotPos = nameWithoutSystem.indexOf('.');
          if (dotPos > 0) {
            dp = nameWithoutSystem.substring(0, dotPos);
            dpe = nameWithoutSystem.substring(dotPos + 1);
          } else {
            dp = nameWithoutSystem;
          }
          
          //console.log('Parsed - DP:', dp, 'DPE:', dpe);
          
          model.dps.add(dp);

          if (dpe) {
            const type = mgr.dpElementType(`${dp}.${dpe}`);
            var typeName = "";
            if (type) typeName = WinccoaElementType[type] as string;
            if (!model.dpes.has(dp)) model.dpes.set(dp, new Map());
            const set = model.dpes.get(dp)!;
            set.set(dpe, typeName);
          }
        }
      }
      
      console.log('Index built - DPs:', model.dps.size, 'Total DPEs:', Array.from(model.dpes.values()).reduce((sum, set) => sum + set.size, 0));
    } catch (e) {
      console.error('dpQuery failed: ' + e);
    }

    //DONE? TODO: build index for CNS tree (mind format of sys.view:tree => if first dot comes before colon, then it's CNS)
    //DONE? TODO group it like dps
    const sysname = mgr.getSystemName();
    const views = mgr.cnsGetViews(sysname.replace(':', '')); //replace the ":" after systemname for cns views
    // console.log("Views: " + views);
    for (const view of views)
    {
      model.views.add(view.replace(':', ''));
      const trees = await mgr.cnsGetTrees(view);
      // console.log('Trees:', trees);
      for (const tree of trees) {
        await traverseTree(mgr, tree, model, view);
      }
    }
    // TODO: build index for message-catalogs and script files
  }

  connection.onInitialize(async (params: InitializeParams) => {
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
      console.log('Client Initialized');
      return result;
  });
  // IMPORTANT: wait until initialization completes

  connection.onInitialized(() => {  
   // Attach your project-specific DB listener here
   // This function will be called whenever the DB changes
   const winccoa = requireWinccoaSafe();
   const mgr = new winccoa.WinccoaManager();
   mgr.sysConnect.on(winccoa.WinccoaSysConEvent.DpCreated, dpCreatedListener);
   mgr.sysConnect.on(winccoa.WinccoaSysConEvent.DpDeleted, dpCreatedListener);
   mgr.sysConnect.on(winccoa.WinccoaSysConEvent.DpTypeChanged, dpCreatedListener);
   mgr.sysConnect.on(winccoa.WinccoaSysConEvent.DpRenamed, dpCreatedListener);
  });

  function dpCreatedListener(details: WinccoaSysConDpDetails) {
    // console.log('DP created - details:');
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
    // console.log('Completion context:', JSON.stringify(context));
    
    const lineText = doc.getText({
      start: { line: _pos.position.line, character: 0 },
      end: _pos.position
    });
    //watch if a cns or dp function is written
    //TODO seperate cns and dp gets
    const matchCns = lineText.match(/\.(?:[A-Za-z0-9_]*?(?:cns)[A-Za-z0-9_]*)\(\s*["'´]([^"'´]*)$/im);
    // console.log('Searching for:', matchCns);
    if (matchCns) {
      const dpObject = matchCns[1];
      console.log("Search string for CNS autocomplete:", dpObject);

      //looks like not containing a system name? - here you go
      if (!(dpObject.indexOf(':') > 0))
      {
        console.log('Available Systems:', Array.from(model.views));
        const matchingViews = Array.from(model.views).filter(sys => sys.startsWith(dpObject));
        for (const view of matchingViews) {
        //  console.log("push " + view + " in context menu");
         items.push({
           label: view,
           kind: CompletionItemKind.Variable,
           insertText: removeBasePrefix(dpObject, view),
         });
        }
        return items;
      }

      const looksLikeCns = dpObject.match(/^([A-Za-z0-9_]+\.[A-Za-z0-9_]+:)([A-Za-z0-9_\.]+)?$/i);
      console.log('lookslikeCNS match result:', looksLikeCns);
      if (looksLikeCns && model.cns.has(looksLikeCns[1])){
        const cnsSystem = looksLikeCns[1];
        //set von map<string, string>
        const map = model.cns.get(cnsSystem);
        console.log('For looksLikeCns available CNS:', map ? Array.from(map.keys()) : 'none');
        if (map) {
          var matchingCns = Array.from(map.keys()).filter(chrildren => chrildren.startsWith(looksLikeCns[2] ?? ""));
          //if (matchingCns.length <= 0) matchingCns = Array.from(map.keys());
          for (const cns of matchingCns) {
             var e = cns;
             if (looksLikeCns[2]?.indexOf(".") > 0) e = e.substring(looksLikeCns[2].lastIndexOf(".") +1);
              console.log("push " + e + " in context menu");
               items.push({
                 label: e,
                 kind: CompletionItemKind.Variable,
                 insertText: removeBasePrefix(dpObject, e),
                 detail: map.get(cns)
               });
          }
        }
        return items;
      }
    }

    const matchDp = lineText.match(/\.(?:[A-Za-z0-9_]*?(?:dp)[A-Za-z0-9_]*)\(\s*["'´]([^"'´]*)$/im);
    if (matchDp) {
      const dpObject = matchDp[1];
      // console.log("Search string for DP autocomplete:", dpObject);
      //looks like not containing a system name?
      //here you go
      if (!(dpObject.indexOf(':') > 0))
      {
        // console.log('Available Systems:', Array.from(model.sys));
        const matchingSys = Array.from(model.sys).filter(sys => sys.startsWith(dpObject));
        for (const sys of matchingSys) {
        //  console.log("push " + sys + " in context menu");
         items.push({
           label: sys,
           kind: CompletionItemKind.Variable,
           insertText: removeBasePrefix(dpObject, sys),
         });
        }
        return items;
      }

      const lookingForConfig = dpObject.match(/^([A-Za-z0-9]+:)([A-Za-z0-9_.]+:)([A-Za-z0-9_]+)?$/i);
      // console.log('Looking for configs:', lookingForConfig);
      if (lookingForConfig) {
        const systemName = lookingForConfig[0];
        const dpName = lookingForConfig[1]
        for (const key of dpConfigAttributes.keys()) {
              //  console.log("push " + key + " in context menu");
          // console.log('Key:', key);
          items.push({ 
            label: key, 
            kind: CompletionItemKind.Field,
            insertText: key // Only insert the remaining part
          });
        }
        return items;
      }

      const lookingForSubConfig = dpObject.match(/^([A-Za-z0-9]+:)([A-Za-z0-9_.]+:)([A-Za-z0-9_]+\.\.)([A-Za-z0-9_]+)?$/i);
      // console.log('Looking for sub:', lookingForSubConfig);
      if (lookingForSubConfig) {
        const systemName = lookingForSubConfig[1];
        const dpName = lookingForSubConfig[2];
        const configs = lookingForSubConfig[3] ?? "";
        const subConfs = dpConfigAttributes.get(configs.replace(/\./gi, ""));
        if (subConfs) {
          // console.log('My subconfigs: ', Array.from(subConfs));
          for (const key of subConfs) {
            // console.log('Key:', key);
            items.push({ 
              label: key, 
              kind: CompletionItemKind.Field,
              insertText: key // Only insert the remaining part
            });
          }
        }
        return items;
      }

      // Parse the current typing context for DpIdentification syntax
      const matchdp = dpObject.match(/^([A-Za-z0-9]+(?::[A-Za-z0-9_]*)?)([\.A-Za-z0-9_]+?)?$/i);
      // console.log('Regex match result:', matchdp);
      if (matchdp) {
        const typedDp = matchdp[1].indexOf(":") > 0 ? matchdp[1].substring( matchdp[1].indexOf(":")+ 1):matchdp[1]; //remove the system1: part
        const typedDpe = matchdp[2];

        // console.log('Typed DP:', typedDp, 'Typed DPE:', typedDpe, 'Get Type' );

        // Check if we have an exact DP match and a dot (suggesting DPE completion)
        if (typedDpe && model.dps.has(typedDp)) {
          // Complete DPE names for the exact DP
          const map = model.dpes.get(typedDp)!;
          const elements = Array.from(map.keys());
          // console.log('Found elements for exact DP', typedDp, ':', elements ? Array.from(elements) : 'none');
          
          if (elements) {
            const dpePrefix = typedDpe.substring(1); // Remove the leading dot 
            for (const e of elements) {
              if (e.startsWith(dpePrefix)) { 
                var b = e;
                if (dpePrefix.lastIndexOf(".") > 0) {b = e.substring(1).substring(dpePrefix.lastIndexOf(".")) }
                items.push({ 
                  label: b, 
                  kind: CompletionItemKind.Field,
                  insertText: removeBasePrefix(dpObject, b), // Only insert the remaining part
                  detail: map.get(e)
                });
              }
            }
          }
        } else {
          // Look for DP name matches (exact or prefix)
          // console.log('Looking for DP matches for:', typedDp, 'Available DPs:', Array.from(model.dps));
          
          // First try exact match (for when typing DPE after complete DP name)
          if (model.dps.has(typedDp)) {
            const map = model.dpes.get(typedDp)!;
            const elements = Array.from(map.keys());
            // console.log('Found elements for exact DP', typedDp, ':', elements ? Array.from(elements) : 'none');

            if (elements) {
              for (const e of elements) {
                items.push({ label: e, kind: CompletionItemKind.Field, detail: map.get(e) });
              }
            }
          } else {
            // Try prefix matching for DP names
            const matchingDps = Array.from(model.dps).filter(dp => dp.startsWith(typedDp));
            // console.log('Found matching DPs by prefix:', matchingDps);
            
            for (const dp of matchingDps) {
              items.push({ 
                label: dp, 
                kind: CompletionItemKind.Variable,
                insertText: removeBasePrefix(dpObject, dp) // Only insert the remaining part
              });
              
            }
          }
        }
      }
    }
    // console.log('Returning', items.length, 'completion items');
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
          //dpGet(`${dp}.${rest}`) //todo add value in description
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
  // DONE? for now done with node server on always, if server stop, client reconnect during runtime
  socket.on('error', () => close());
  socket.on('close', () => close());
  socket.on('end', () => close());
  connection.listen();
});

server.on('error', (err) => {
  console.error('LS socket server error:', err);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`LSP server listening on ${HOST}:${PORT}`);
});

async function traverseTree(mgr: any, node: string, model: ModelIndex, view: string): Promise<void> {
  const children = await mgr.cnsGetChildren(node);
  // console.log(`Children of ${node}:`, children);
  if (!model.cns.has(view)) model.cns.set(view, new Map());

  // Map<nodeName, dislpayName>
  const set = model.cns.get(view)!;
  const displayName = mgr.cnsGetDisplayNames(node);
  set.set(node.replace(view, ""), displayName);
  // console.log(`Added child in line: ${node.replace(view, "")} in view ${view}`);
  
  for (const child of children) {
    await traverseTree(mgr, child, model, view);
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
