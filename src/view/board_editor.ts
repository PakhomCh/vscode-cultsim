import * as vscode from 'vscode';
import path = require('path');
import { Renderer } from '../util/renderer';
import { Uri } from 'vscode';
import { Content, ContentType } from '../model/content';
import { VSCode } from './board_editor/vscode';

export class BoardEditor implements vscode.CustomTextEditorProvider {
	static UI_PATH = null;

	public static register(context: vscode.ExtensionContext, coreContent?: Content) {
		const provider = new BoardEditor(context, coreContent);
		const providerRegistration = vscode.window.registerCustomEditorProvider(BoardEditor.viewType, provider);
		context.subscriptions.push(providerRegistration);
	}

	private static readonly viewType = 'cultsim.editor.board';

	private _context: vscode.ExtensionContext;
	private _coreContent: Content;

	constructor(private readonly context: vscode.ExtensionContext, coreContent?: Content) {
		this._context = context;
		this._coreContent = coreContent;
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {

		webviewPanel.webview.options = {
			enableScripts: true
		};
		webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

		function updateWebview() {
			webviewPanel.webview.postMessage({
				type: 'change',
				document: document.getText(),
			});
		}
		const content = Content.fromString(document.getText());
		if (content == null || content.type == ContentType.Unknown) {
			vscode.commands.executeCommand('workbench.action.toggleEditorType');
			return;
		}

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		// Make sure we get rid of the listener when our editor is closed.
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});

		// Receive message from the webview.
		webviewPanel.webview.onDidReceiveMessage(async e => {
			try {
				switch (e.type) {
					case 'toggle-editor':
						vscode.window.showWarningMessage(e.message);
						vscode.commands.executeCommand('workbench.action.toggleEditorType');
						return;
					case 'reload':
						vscode.window.showWarningMessage(e.message);
						vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction');
						return;
					case 'error':
						vscode.window.showErrorMessage(e.message);
						return;
					case 'info':
						vscode.window.showInformationMessage(e.message);
						return;
					case 'warning':
						vscode.window.showWarningMessage(e.message);
						return;
					case 'change':
						await this.save(document, e.document);
						return;
					case 'request':
						if (!e?.method) return;
						webviewPanel.webview.postMessage({
							type: 'response',
							id: e.id,
							response: await this.request(webviewPanel.webview, e.method, ...e.args)
						});
						return;
				}
			} catch (e) {
				vscode.window.showErrorMessage(e.message);
			}
		});

		updateWebview();
	}

	private request(webview: vscode.Webview, method: string, ...args: any[]): Promise<any> {
		method = method[0].toUpperCase() + method.substring(1);
		if (!(`request${method}` in this)) throw new Error(`Request method "${method}" unsupported`);
		return this[`request${method}`](webview, ...args);
	}

	private async requestImage(webview: vscode.Webview, type: string, id?: string): Promise<string> {
		try {
			if (!id) throw new Error("No ID");
			if (!type) throw new Error("No Type provided");
			switch (type) {
				case 'element': {
					const filesElements = await vscode.workspace.findFiles(`images/elements/${id}.png`);
					if (filesElements.length > 0) {
						return webview.asWebviewUri(filesElements[0]).toString();
					}
					const filesAspects = await vscode.workspace.findFiles(`images/aspects/${id}.png`);
					if (filesAspects.length > 0) {
						return webview.asWebviewUri(filesAspects[0]).toString();
					}
					const element = this._coreContent.elements.find(element => element.id == id);
					if (element) {
						if (element.isAspect) {
							return `https://www.frangiclave.net/static/images/icons40/aspects/${element.id}.png`;
						}
						return `https://www.frangiclave.net/static/images/elementArt/${element.id}.png`;
					}
					break;
				}
				case 'legacy': {
					const files = await vscode.workspace.findFiles(`images/legacies/${id}.png`);
					if (files.length > 0) {
						return webview.asWebviewUri(files[0]).toString();
					}
					const legacy = this._coreContent.legacies.find(legacy => legacy.id == id);
					if (legacy) {
						return `https://www.frangiclave.net/static/images/icons100/legacies/${legacy.id}.png`;
					}
					break;
				}
				case 'ending': {
					const files = await vscode.workspace.findFiles(`images/endings/${id}.png`);
					if (files.length > 0) {
						return webview.asWebviewUri(files[0]).toString();
					}
					const ending = this._coreContent.endings.find(ending => ending.id == id);
					if (ending) {
						return `https://www.frangiclave.net/static/images/endingArt/${ending.id}.png`;
					}
					break;
				}
				case 'verb': {
					const files = await vscode.workspace.findFiles(`images/verbs/${id}.png`);
					if (files.length > 0) {
						return webview.asWebviewUri(files[0]).toString();
					}
					const verb = this._coreContent.verbs.find(verb => verb.id == id);
					if (verb) {
						return `https://www.frangiclave.net/static/images/icons100/verbs/${verb.id}.png`;
					}
					break;
				}
			}
			throw new Error("unsupported type");
		} catch {
			return 'https://www.frangiclave.net/static/images/icons40/aspects/_x.png';
		}
	}

	private async requestIDs(webview: vscode.Webview, type: string): Promise<string[]> {
		try {
			if (!type) throw new Error("No Type provided");
			switch (type) {
				case 'element':
					return this._coreContent.elements.map(element => element.id);
				case 'recipe':
					return this._coreContent.recipes.map(recipe => recipe.id);
				case 'deck':
					return this._coreContent.decks.map(deck => deck.id);
				case 'legacy':
					return this._coreContent.legacies.map(legacy => legacy.id);
				case 'ending':
					return this._coreContent.endings.map(ending => ending.id);
				case 'verb':
					return this._coreContent.verbs.map(verb => verb.id);
			}
			throw new Error("unsupported type");
		} catch {
			return [];
		}
	}

	protected save(document: vscode.TextDocument, text: string): Thenable<boolean> {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			document.uri,
			new vscode.Range(0, 0, document.lineCount, 0),
			text);
		return vscode.workspace.applyEdit(edit);
	}

	/**
	 * Get the static html used for the editor webviews.
	 */
	private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
		const assetsBaseURI = Uri.joinPath(this.context.extensionUri, 'media', 'board');
		return await Renderer.htmlForWebView(
			webview,
			Uri.joinPath(this.context.extensionUri, 'src', 'view', 'board_editor', 'board.html'),
			assetsBaseURI,
			"../reset.css",
			"../vscode.css",
			"../../src/view/board_editor/board.css",
			"../../dist/board.js",
			"../fa/css/fontawesome.css",
			"../fa/css/brands.css",
			"../fa/css/solid.css"
		);
	}

	/**
	 * Write out the json to a given document.
	 */
	private updateTextDocument(document: vscode.TextDocument, json: any) {
		const edit = new vscode.WorkspaceEdit();

		// Just replace the entire document every time for this example extension.
		// A more complete extension should compute minimal edits instead.
		edit.replace(
			document.uri,
			new vscode.Range(0, 0, document.lineCount, 0),
			JSON.stringify(json, null, 2));

		return vscode.workspace.applyEdit(edit);
	}
}
