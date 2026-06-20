import { useState, useEffect, useRef } from 'react';
import { Share2, RefreshCw, Trash2, LogIn } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Divider,
  Field,
  Input,
  Select,
  SettingsPageHeader,
} from '../../ui';
import type { SelectOption } from '../../ui';
import { Spinner } from '../../ui/primitives/Spinner';
import { usePublishStore } from '../../store/publish';
import type { PublishAccount, PublishPlatform } from '../../lib/electron-api';
import styles from './PublishAccountsTab.module.css';

// ─── Platform labels ─────────────────────────────────────────────────────────

const PLATFORM_OPTIONS: SelectOption[] = [
  { value: 'douyin', label: '抖音' },
  { value: 'tencent', label: '视频号' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'kuaishou', label: '快手' },
  { value: 'bilibili', label: 'B站' },
];

const PLATFORM_LABEL: Record<PublishPlatform, string> = {
  douyin: '抖音',
  tencent: '视频号',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  bilibili: 'B站',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(
  status: PublishAccount['status'],
): 'success' | 'warning' | 'secondary' {
  switch (status) {
    case 'valid':
      return 'success';
    case 'expired':
      return 'warning';
    default:
      return 'secondary';
  }
}

function statusLabel(status: PublishAccount['status']): string {
  switch (status) {
    case 'valid':
      return '有效';
    case 'expired':
      return '已过期';
    default:
      return '未知';
  }
}

function formatLastChecked(ts?: number): string {
  if (!ts) return '从未校验';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PublishAccountsTab() {
  const { accounts, loadAccounts, addAccount, checkAccount, removeAccount } = usePublishStore();

  const [platform, setPlatform] = useState<PublishPlatform>('douyin');
  const [accountName, setAccountName] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [qrcodePng, setQrcodePng] = useState<string | null>(null);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [reloginTarget, setReloginTarget] = useState<string | null>(null);

  const unsubQrcodeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void loadAccounts();
    return () => {
      unsubQrcodeRef.current?.();
      unsubQrcodeRef.current = null;
    };
  }, []);

  // Subscribe to qrcode events during login
  const subscribeQrcode = () => {
    if (unsubQrcodeRef.current) return;
    const unsub = window.publishAPI.onQrcode((payload) => {
      setQrcodePng(payload.png);
    });
    unsubQrcodeRef.current = unsub;
  };

  const unsubscribeQrcode = () => {
    if (unsubQrcodeRef.current) {
      unsubQrcodeRef.current();
      unsubQrcodeRef.current = null;
    }
  };

  const handleLogin = async () => {
    const name = accountName.trim();
    if (!name) {
      setLoginMsg({ text: '请输入账号名称', isError: true });
      return;
    }
    setLoginBusy(true);
    setLoginMsg({ text: '正在打开浏览器，请在弹出的窗口中扫码登录…', isError: false });
    setQrcodePng(null);
    subscribeQrcode();
    try {
      const res = await addAccount(platform, name);
      if (res.success) {
        setLoginMsg({ text: '登录成功', isError: false });
        setAccountName('');
        setQrcodePng(null);
      } else {
        setLoginMsg({ text: res.message || '登录失败', isError: true });
      }
    } catch (err: unknown) {
      setLoginMsg({ text: err instanceof Error ? err.message : '登录异常', isError: true });
    } finally {
      setLoginBusy(false);
      unsubscribeQrcode();
    }
  };

  const handleRelogin = async (acc: PublishAccount) => {
    setReloginTarget(acc.id);
    setLoginMsg({ text: `正在为 ${acc.accountName} 重新登录，请在浏览器中扫码…`, isError: false });
    setQrcodePng(null);
    subscribeQrcode();
    try {
      const res = await addAccount(acc.platform, acc.accountName);
      if (res.success) {
        setLoginMsg({ text: '重新登录成功', isError: false });
        setQrcodePng(null);
      } else {
        setLoginMsg({ text: res.message || '登录失败', isError: true });
      }
    } catch (err: unknown) {
      setLoginMsg({ text: err instanceof Error ? err.message : '登录异常', isError: true });
    } finally {
      setReloginTarget(null);
      unsubscribeQrcode();
    }
  };

  const handleCheck = async (id: string) => {
    setCheckingId(id);
    try {
      await checkAccount(id);
    } catch (err: unknown) {
      setLoginMsg({ text: err instanceof Error ? err.message : '校验失败', isError: true });
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeAccount(deleteTarget);
      setDeleteTarget(null);
    } catch (err: unknown) {
      setLoginMsg({ text: err instanceof Error ? err.message : '删除失败', isError: true });
      setDeleteTarget(null);
    }
  };

  const deleteTargetAcc = accounts.find((a) => a.id === deleteTarget);

  return (
    <div className={styles.container}>
      <SettingsPageHeader
        title="发布账号"
        description="管理各平台发布账号与登录状态"
        leading={<Share2 size={24} className={styles.platformIcon} />}
      />

      {/* ── Account list ── */}
      {accounts.length === 0 ? (
        <p className={styles.emptyState}>暂无发布账号，请在下方添加。</p>
      ) : (
        <div className={styles.accountList}>
          {accounts.map((acc) => {
            const isChecking = checkingId === acc.id;
            const isRelogging = reloginTarget === acc.id;
            return (
              <div key={acc.id} className={styles.accountRow}>
                <div className={styles.accountInfo}>
                  <span className={styles.accountName}>
                    {PLATFORM_LABEL[acc.platform]} · {acc.accountName}
                  </span>
                  <span className={styles.accountMeta}>
                    上次校验：{formatLastChecked(acc.lastCheckedAt)}
                  </span>
                </div>
                <Badge variant={statusVariant(acc.status)}>{statusLabel(acc.status)}</Badge>
                <div className={styles.accountActions}>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleCheck(acc.id)}
                    disabled={isChecking || isRelogging}
                    leftIcon={
                      isChecking ? (
                        <Spinner size={12} className={styles.spinning} />
                      ) : (
                        <RefreshCw size={12} />
                      )
                    }
                  >
                    校验
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRelogin(acc)}
                    disabled={isChecking || isRelogging}
                    leftIcon={
                      isRelogging ? (
                        <Spinner size={12} className={styles.spinning} />
                      ) : (
                        <LogIn size={12} />
                      )
                    }
                  >
                    重登
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(acc.id)}
                    disabled={isChecking || isRelogging}
                    leftIcon={<Trash2 size={12} />}
                  >
                    删除
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add account ── */}
      <Divider label="添加账号" />

      <div className={styles.addSection}>
        <div className={styles.addRow}>
          <Field label="平台" className={styles.addSelectWrap}>
            <Select
              options={PLATFORM_OPTIONS}
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PublishPlatform)}
            />
          </Field>
          <Field label="账号名称（备注）" className={styles.addInputWrap}>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="例如：主账号"
              disabled={loginBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLogin();
              }}
            />
          </Field>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleLogin()}
            disabled={loginBusy}
            leftIcon={
              loginBusy ? (
                <Spinner size={13} className={styles.spinning} />
              ) : (
                <LogIn size={13} />
              )
            }
          >
            {loginBusy ? '登录中…' : '登录'}
          </Button>
        </div>

        {loginMsg ? (
          <p className={`${styles.loginStatus} ${loginMsg.isError ? styles.loginError : ''}`}>
            {loginMsg.text}
          </p>
        ) : null}

        {qrcodePng ? (
          <div className={styles.qrcodeWrap}>
            <span className={styles.qrcodeLabel}>二维码（备用，建议直接在弹出的浏览器中扫码）</span>
            <img
              src={`file://${qrcodePng}`}
              alt="登录二维码"
              className={styles.qrcodeImg}
            />
          </div>
        ) : null}
      </div>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="确认删除账号？"
        description={
          deleteTargetAcc
            ? `将删除「${PLATFORM_LABEL[deleteTargetAcc.platform]} · ${deleteTargetAcc.accountName}」的登录状态，无法恢复。`
            : '确认删除此账号？'
        }
        confirmText="删除"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
