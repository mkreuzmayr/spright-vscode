import * as vscode from "vscode";
import * as util from "./util";
import * as spright from "./spright";

class SprightEditor {
  private readonly context: vscode.ExtensionContext;
  private readonly webview: vscode.Webview;
  private readonly document: vscode.TextDocument;
  private diagnosticsCollection?: vscode.DiagnosticCollection;
  private diagnostics: vscode.Diagnostic[] = [];
  private updatingWebview = false;
  private updateWebviewOnceMore = false;

  constructor(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ) {
    this.context = context;
    this.document = document;
    this.webview = webviewPanel.webview;

    this.webview.options = {
      enableScripts: true,
    };
    this.webview.html = this.getHtmlForWebview();

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          this.updateWebviewDebounced();
        }
      }
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    this.webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case "updateConfig":
          this.updateConfig(e.text);
          return;

        case "execSpright":
          spright
            .autocompleteConfig(this.document.fileName, e.text)
            .then((output: spright.Result) => {
              console.log(output);
            });
          return;
      }
    });

    if (vscode.window.activeTextEditor?.document == document) {
      this.showDiagnostics();
    }

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document == document) this.showDiagnostics();
      else this.hideDiagnostics();
    });
  }

  private updateWebviewDebounced() {
    if (this.updatingWebview) {
      this.updateWebviewOnceMore = true;
      return;
    }
    this.updatingWebview = true;
    setTimeout(async () => {
      await this.updateWebview();
      this.updatingWebview = false;
      if (this.updateWebviewOnceMore) {
        this.updateWebviewOnceMore = false;
        this.updateWebviewDebounced();
      }
    }, 100);
  }

  public async initialize() {
    await this.updateWebview();
  }

  private async getAutocompletedConfig() {
    const result = await spright.autocompleteConfig(
      this.document.fileName,
      this.document.getText()
    );
    this.parseErrorOutput(result.stderr);
    return result.stdout;
  }

  private async getOutputDescription(config: string) {
    const result = await spright.getOutputDescription(
      this.document.fileName,
      config
    );
    return JSON.parse(result.stdout);
  }

  private async updateWebview() {
    const config = await this.getAutocompletedConfig();
    const description = await this.getOutputDescription(config);

    const getUri = (path: string, filename: string) => {
      const uri = this.webview.asWebviewUri(
        vscode.Uri.joinPath(this.document.uri, "/../", path, filename)
      );
      return `${uri}`;
    };
    for (const source of description.sources)
      source.uri = getUri(source.path, source.filename);

    this.webview.postMessage({
      type: "setConfig",
      config,
      description,
    });
  }

  private parseErrorOutput(output: string) {
    this.diagnostics = [];
    for (const line of output.split(/[\n\r]+/)) {
      // "message in line N"
      const match = line.split(" in line ");
      const message = match[0];
      let range: vscode.Range;
      if (match.length > 1) {
        const lineNo = Number.parseInt(match[1]) - 1;
        const configLine = this.document.lineAt(lineNo);
        const sc = configLine.firstNonWhitespaceCharacterIndex;
        range = new vscode.Range(lineNo, sc, lineNo, configLine.text.length);
      } else {
        range = new vscode.Range(0, 0, 0, 0);
      }
      this.diagnostics.push({
        message,
        range: range,
        severity: vscode.DiagnosticSeverity.Error,
        source: "",
      });
    }
    this.updateDiagnostics();
  }

  private showDiagnostics() {
    if (!this.diagnosticsCollection)
      this.diagnosticsCollection =
        vscode.languages.createDiagnosticCollection("spright");
    this.updateDiagnostics();
  }

  private updateDiagnostics() {
    if (this.diagnosticsCollection)
      this.diagnosticsCollection.set(this.document.uri, this.diagnostics);
  }

  private hideDiagnostics() {
    if (this.diagnosticsCollection) {
      this.diagnosticsCollection.clear();
      delete this.diagnosticsCollection;
    }
  }

  private getHtmlForWebview(): string {
    const getWebviewPath = (path: string, file: string) => {
      return this.webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, path, file)
      );
    };
    const scriptUri = getWebviewPath("out/web", "webView.js");
    const styleResetUri = getWebviewPath("media", "reset.css");
    const styleVSCodeUri = getWebviewPath("media", "vscode.css");
    const styleMainUri = getWebviewPath("media", "webView.css");

    // Use a nonce to whitelist which scripts can be run
    const nonce = util.getNonce();
    return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.webview.cspSource}; style-src ${this.webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet" />
				<link href="${styleVSCodeUri}" rel="stylesheet" />
				<link href="${styleMainUri}" rel="stylesheet" />
				<title>Spright Configuration Editor</title>
			</head>
			<body>
				<div id="content"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }

  private updateConfig(config: string) {
    const edit = new vscode.WorkspaceEdit();

    // Just replace the entire document every time
    // A more complete extension should compute minimal edits instead.
    edit.replace(
      this.document.uri,
      new vscode.Range(0, 0, this.document.lineCount, 0),
      config
    );
    return vscode.workspace.applyEdit(edit);
  }
}

export class SprightEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {
    const sprightBinaryPath =
      `bin/spright-${process.platform}-${process.arch}` +
      (process.platform === "win32" ? ".exe" : "");
    spright.setBinaryPath(this.context.asAbsolutePath(sprightBinaryPath));
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const editor = new SprightEditor(this.context, document, webviewPanel);
    return editor.initialize();
  }
}
