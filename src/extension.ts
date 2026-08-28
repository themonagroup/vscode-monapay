import * as vscode from 'vscode';
import { MonaPay } from '@monapay/node';

type Transaction = Record<string, unknown>;

const USERNAME_KEY = 'monapay.username';
const PASSWORD_KEY = 'monapay.password';
const CLIENT_SECRET_KEY = 'monapay.clientSecret';
const VA_KEY = 'monapay.virtualAccountNumber';

class TransactionItem extends vscode.TreeItem {
  constructor(transaction: Transaction) {
    const code = String(transaction.transaction_code ?? transaction.id ?? 'Không có mã');
    const amount = Number(transaction.amount ?? 0);
    super(`${amount.toLocaleString('vi-VN')} đ`, vscode.TreeItemCollapsibleState.None);
    this.description = code;
    this.tooltip = new vscode.MarkdownString([
      `**${code}**`,
      `- Số tiền: ${amount.toLocaleString('vi-VN')} đ`,
      `- Nội dung: ${String(transaction.transaction_content ?? transaction.description ?? '')}`,
      `- Thời gian: ${String(transaction.transaction_date ?? transaction.transfer_date ?? '')}`,
    ].join('\n'));
    this.iconPath = new vscode.ThemeIcon('arrow-down');
  }
}

class TransactionsProvider implements vscode.TreeDataProvider<TransactionItem> {
  private readonly changes = new vscode.EventEmitter<TransactionItem | undefined>();
  private transactions: Transaction[] = [];
  private emptyMessage = 'Chạy “MONA Pay: Xem giao dịch” để chọn VA.';

  readonly onDidChangeTreeData = this.changes.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  getTreeItem(item: TransactionItem): vscode.TreeItem {
    return item;
  }

  getChildren(): TransactionItem[] {
    if (this.transactions.length === 0) {
      const empty = new vscode.TreeItem(this.emptyMessage, vscode.TreeItemCollapsibleState.None);
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty as TransactionItem];
    }
    return this.transactions.map((transaction) => new TransactionItem(transaction));
  }

  async load(virtualAccountNumber: string): Promise<void> {
    this.emptyMessage = 'Đang tải giao dịch…';
    this.transactions = [];
    this.changes.fire(undefined);

    const client = await createClient(this.context);
    const result = await client.transactions.list({ virtualAccountNumber, page: 1, limit: 20 });
    this.transactions = Array.isArray(result?.data) ? result.data : [];
    this.emptyMessage = 'VA này chưa có giao dịch.';
    this.changes.fire(undefined);
  }
}

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('monapay');
}

async function createClient(context: vscode.ExtensionContext): Promise<MonaPay> {
  const username = context.globalState.get<string>(USERNAME_KEY);
  const password = await context.secrets.get(PASSWORD_KEY);
  const clientSecret = await context.secrets.get(CLIENT_SECRET_KEY);
  if (!username || !password) {
    throw new Error('Chưa đăng nhập. Chạy “MONA Pay: Đăng nhập” trước.');
  }
  return new MonaPay({
    baseUrl: configuration().get<string>('baseUrl', 'https://api.monapay.vn'),
    username,
    password,
    clientSecret,
  });
}

async function requiredInput(options: vscode.InputBoxOptions): Promise<string | undefined> {
  return vscode.window.showInputBox({
    ...options,
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : 'Không được để trống.',
  });
}

async function login(context: vscode.ExtensionContext): Promise<void> {
  const username = await requiredInput({
    prompt: 'Username MONA Pay',
    value: context.globalState.get<string>(USERNAME_KEY, ''),
  });
  if (!username) return;

  const password = await requiredInput({ prompt: 'Password MONA Pay', password: true });
  if (!password) return;

  const currentSecret = await context.secrets.get(CLIENT_SECRET_KEY);
  const enteredSecret = await vscode.window.showInputBox({
    prompt: 'Client secret cho thao tác ghi (có thể để trống nếu chỉ xem)',
    placeHolder: currentSecret ? 'Để trống để giữ secret đang lưu' : 'client_secret',
    password: true,
    ignoreFocusOut: true,
  });
  if (enteredSecret === undefined) return;
  const clientSecret = enteredSecret.trim() || currentSecret;

  const client = new MonaPay({
    baseUrl: configuration().get<string>('baseUrl', 'https://api.monapay.vn'),
    username: username.trim(),
    password,
    clientSecret,
  });
  await client.me();

  await context.globalState.update(USERNAME_KEY, username.trim());
  await context.secrets.store(PASSWORD_KEY, password);
  if (clientSecret) await context.secrets.store(CLIENT_SECRET_KEY, clientSecret);
  await vscode.window.showInformationMessage('MONA Pay: Đăng nhập thành công.');
}

async function createQr(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<void> {
  const client = await createClient(context);
  if (!client.clientSecret) {
    throw new Error('Tạo QR cần client secret. Chạy lại “MONA Pay: Đăng nhập” để lưu secret.');
  }

  const ownerNumber = await requiredInput({ prompt: 'Số tài khoản ACB nhận tiền' });
  if (!ownerNumber) return;
  const ownerType = await vscode.window.showQuickPick(['ORG', 'PER'], { placeHolder: 'Loại chủ tài khoản' });
  if (!ownerType) return;
  const merchantId = await requiredInput({ prompt: 'Merchant ID ACB' });
  if (!merchantId) return;
  const terminalId = await requiredInput({ prompt: 'Terminal ID ACB' });
  if (!terminalId) return;
  const orderId = await requiredInput({ prompt: 'Mã đơn hàng' });
  if (!orderId) return;
  const virtualAccountPrefix = await requiredInput({ prompt: 'Đầu số VA (tối đa 10 ký tự)' });
  if (!virtualAccountPrefix) return;
  const beneficiaryName = await requiredInput({ prompt: 'Tên người thụ hưởng' });
  if (!beneficiaryName) return;
  const amountText = await requiredInput({
    prompt: 'Số tiền (VND, số nguyên, tối đa 1.000.000.000)',
    validateInput: undefined,
  });
  if (!amountText) return;
  const amount = Number(amountText);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error('Số tiền phải là số nguyên từ 1 đến 1.000.000.000 VND.');
  }
  const description = await vscode.window.showInputBox({ prompt: 'Nội dung chuyển khoản (không bắt buộc)' });
  if (description === undefined) return;

  const qr = await client.qr.generate({
    ownerNumber: ownerNumber.trim(),
    ownerType,
    merchantId: merchantId.trim(),
    terminalId: terminalId.trim(),
    orderId: orderId.trim(),
    virtualAccountPrefix: virtualAccountPrefix.trim(),
    beneficiaryName: beneficiaryName.trim(),
    amount,
    ...(description.trim() ? { description: description.trim() } : {}),
  });
  const qrData = String(qr?.qr_data_url ?? '');
  if (!qrData) throw new Error('Response tạo QR không có qr_data_url.');

  await vscode.env.clipboard.writeText(qrData);
  output.appendLine(`[${new Date().toISOString()}] QR ${orderId}: ${qrData}`);
  output.show(true);
  await vscode.window.showInformationMessage('Đã tạo QR và chép chuỗi qr_data_url vào clipboard.');
}

async function showTransactions(
  context: vscode.ExtensionContext,
  provider: TransactionsProvider,
): Promise<void> {
  const virtualAccountNumber = await requiredInput({
    prompt: 'Số tài khoản ảo (VA)',
    value: context.globalState.get<string>(VA_KEY, ''),
  });
  if (!virtualAccountNumber) return;
  await context.globalState.update(VA_KEY, virtualAccountNumber.trim());
  await provider.load(virtualAccountNumber.trim());
  await vscode.commands.executeCommand('monapay.recentTransactions.focus');
}

function listenWebhook(): void {
  const configuredPort = configuration().get<number>('webhookPort', 3939);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
    ? configuredPort
    : 3939;
  const terminal = vscode.window.createTerminal({ name: 'MONA Pay webhook' });
  terminal.show();
  terminal.sendText(`monapay webhook listen --port ${port}`);
}

async function run(command: () => Promise<void> | void): Promise<void> {
  try {
    await command();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`MONA Pay: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('MONA Pay');
  const provider = new TransactionsProvider(context);
  const tree = vscode.window.createTreeView('monapay.recentTransactions', { treeDataProvider: provider });

  context.subscriptions.push(
    output,
    tree,
    vscode.commands.registerCommand('monapay.login', () => run(() => login(context))),
    vscode.commands.registerCommand('monapay.createQr', () => run(() => createQr(context, output))),
    vscode.commands.registerCommand('monapay.showTransactions', () => run(() => showTransactions(context, provider))),
    vscode.commands.registerCommand('monapay.listenWebhook', () => run(() => listenWebhook())),
  );
}

export function deactivate(): void {}
