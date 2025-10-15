
import * as vscode from 'vscode';
import {
  integer,
  State,
  LanguageClient,
  LanguageClientOptions,
  StreamInfo
} from 'vscode-languageclient/node';
import * as net from 'net';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  //const host = '127.0.0.1';
  //const port = 2087;
  const output = vscode.window.createOutputChannel('MyExt Debug');
  output.show(true);
  output.appendLine('[MyExt] Extension activated.');
  const extensionContext = vscode.workspace.getConfiguration('winccoaLsp');
  const host = extensionContext.get<string>('apiUrl') ?? '127.0.0.1';;
  const port = extensionContext.get<number>('port') ?? 2087;

  const serverOptions = (): Promise<StreamInfo> =>
    new Promise((resolve, reject) => {
      const socket = net.connect(port, host);
      socket.on('connect', () => resolve({ reader: socket, writer: socket }));
      socket.on('error', reject);
    });

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'javascript' }, { scheme: 'file', language: 'typescript' }],
    synchronize: { configurationSection: 'winccoaLsp' },
    initializationOptions: {
      mode: vscode.workspace.getConfiguration('winccoaLsp').get('mode'),
      query: vscode.workspace.getConfiguration('winccoaLsp').get('query')
    }
  };

  client = new LanguageClient('winccoaLsp', 'WinCC OA LSP (Starter)', serverOptions, clientOptions);
  client.onDidChangeState((event) => {
    const stateMsg = `[MyExt] State changed: ${State[event.oldState]} → ${State[event.newState]}`;
    console.log(stateMsg);
    output.appendLine(stateMsg);

    if (event.newState === State.Stopped) {
      output.appendLine('[MyExt] Language server stopped — attempting delayed restart...');
      setTimeout(() => {
        startClientWithRetry(client!, output)
          .then(() => output.appendLine('[MyExt] Restart successful!'))
          .catch(err => output.appendLine(`[MyExt] Restart failed: ${err}`));
      }, 5000); // wait 2 s before retrying
    }
  });

  client.start();
  // context.subscriptions.push(client.start());

  context.subscriptions.push(
    vscode.commands.registerCommand('winccoaLsp.reloadIndex', async () => {
      await client?.sendRequest('workspace/reloadIndex');
      vscode.window.showInformationMessage('WinCC OA LSP: reloaded index');
    })
  );

}

async function startClientWithRetry(client: LanguageClient, output: vscode.OutputChannel, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      output.appendLine(`[MyExt] Starting language client (attempt ${attempt + 1})...`);
      console.log(`[MyExt] Starting language client (attempt ${attempt + 1})...`);
      const disposable = client.start();
      output.appendLine('[MyExt] Language client started successfully!');
      return disposable;
    } catch (err) {
      attempt++;
      const delay = 1000 * attempt; // exponential backoff
      output.appendLine(`[MyExt] Failed to start (attempt ${attempt}), retrying in ${delay}ms: ${err}`);
      await new Promise(res => setTimeout(res, delay));
    }
  }

  output.appendLine('[MyExt] Failed to start language client after max retries.');
  throw new Error('Language client could not be started.');
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
