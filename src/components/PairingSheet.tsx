import { useEffect, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Laptop,
  QrCode,
  Radio,
  RefreshCw,
  Smartphone,
  Trash2,
  Wifi,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useMobileStore } from '../state/useMobileStore'
import {
  getDefaultPhoneName,
  isNativeShell,
  parsePairingQr,
  requestNativeQrScan,
  triggerHaptic,
} from '../transport/nativeBridge'

export function PairingSheet() {
  const open = useMobileStore((s) => s.pairingOpen)
  const setOpen = useMobileStore((s) => s.setPairingOpen)
  const localFeel = useMobileStore((s) => s.localFeel)
  const effectiveTheme = useMobileStore((s) => s.effectiveTheme)
  const updateLocalFeel = useMobileStore((s) => s.updateLocalFeel)
  const savedHosts = useMobileStore((s) => s.savedHosts)
  const discoveredHosts = useMobileStore((s) => s.discoveredHosts)
  const discoveringLan = useMobileStore((s) => s.discoveringLan)
  const hostId = useMobileStore((s) => s.hostId)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const connectSavedHost = useMobileStore((s) => s.connectSavedHost)
  const discoverAndReconnect = useMobileStore((s) => s.discoverAndReconnect)
  const connectDemo = useMobileStore((s) => s.connectDemo)
  const pairFromOffer = useMobileStore((s) => s.pairFromOffer)
  const forgetHost = useMobileStore((s) => s.forgetHost)

  const isLight = effectiveTheme === 'light'

  const [nameDraft, setNameDraft] = useState(localFeel.deviceName)
  const [nameSavedFlash, setNameSavedFlash] = useState(false)
  const [qrInput, setQrInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    setNameDraft(localFeel.deviceName)
  }, [localFeel.deviceName, open])

  if (!open) return null

  const saveDeviceName = () => {
    const cleaned = nameDraft.trim().slice(0, 48) || getDefaultPhoneName()
    setNameDraft(cleaned)
    if (cleaned !== localFeel.deviceName) {
      updateLocalFeel({ deviceName: cleaned })
      triggerHaptic('confirm')
      setNameSavedFlash(true)
      setTimeout(() => setNameSavedFlash(false), 1200)
    }
  }

  const discoveredIds = new Set(discoveredHosts.map((d) => d.hostId))
  const unpairedDiscovered = discoveredHosts.filter(
    (d) => !savedHosts.some((s) => s.hostId === d.hostId),
  )

  const submitQrText = (raw: string) => {
    try {
      const offer = parsePairingQr(raw)
      setParseError(null)
      setQrInput('')
      pairFromOffer(offer)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '无法解析配对信息')
      triggerHaptic('error')
    }
  }

  const handleScan = () => {
    triggerHaptic('tap')
    const started = requestNativeQrScan((raw) => submitQrText(raw))
    if (!started) {
      setParseError('浏览器调试模式请粘贴桌面端生成的配对 JSON')
    }
  }

  return (
    <div className="ak-backdrop fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm">
      <div className="ak-sheet w-full max-w-md rounded-t-3xl border-t p-5 safe-bottom space-y-4 max-h-[86vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className={clsx('w-4 h-4', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <h2 className="ak-text-1 text-base font-semibold">连接电脑端 Axonkey</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ak-pill ak-text-2 w-8 h-8 rounded-full border inline-flex items-center justify-center"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Custom Phone Remark Name */}
        <div className="ak-well p-3 rounded-2xl border space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-1 inline-flex items-center gap-1.5 font-medium">
              <Smartphone
                className={clsx('w-3.5 h-3.5', isLight ? 'text-blue-600' : 'text-blue-400')}
              />
              <span>本机备注名称（显示在电脑端）</span>
            </span>
            {nameSavedFlash && (
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 text-[11px] font-medium',
                  isLight ? 'text-emerald-700' : 'text-emerald-300',
                )}
              >
                <Check className="w-3 h-3" />
                已同步
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameDraft}
              maxLength={48}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveDeviceName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              placeholder={getDefaultPhoneName()}
              className="ak-input flex-1 h-10 px-3 rounded-xl border text-sm focus:outline-none focus:border-blue-500"
            />
            {nameDraft.trim() !== localFeel.deviceName && (
              <button
                type="button"
                onClick={saveDeviceName}
                className="h-10 px-3.5 rounded-xl bg-blue-600 text-xs font-semibold text-white shrink-0"
              >
                保存
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleScan}
          className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm shadow-blue-500/25"
        >
          <QrCode className="w-4 h-4" />
          <span>{isNativeShell() ? '扫描电脑端配对二维码' : '扫码配对（原生 App）'}</span>
        </button>

        {/* Saved Paired Hosts + LAN Auto-Discovery Refresh */}
        {savedHosts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="ak-text-2 text-xs font-medium">
                已配对电脑（支持 IP/端口变更自动发现）
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  discoverAndReconnect(650)
                }}
                className={clsx(
                  'inline-flex items-center gap-1 text-[11px] font-semibold',
                  isLight ? 'text-blue-600' : 'text-blue-300',
                )}
              >
                <RefreshCw className={clsx('w-3 h-3', discoveringLan && 'animate-spin')} />
                <span>{discoveringLan ? '扫描中…' : '局域网探测'}</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {savedHosts.map((h) => {
                const current = !isDemoMode && hostId === h.hostId && phase === 'active'
                const onlineOnLan = discoveredIds.has(h.hostId)
                return (
                  <div
                    key={h.hostId}
                    className={clsx(
                      'flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border transition-colors',
                      current
                        ? isLight
                          ? 'bg-emerald-600/10 border-emerald-500/35'
                          : 'bg-emerald-500/10 border-emerald-400/35'
                        : 'ak-well',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        connectSavedHost(h)
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <Laptop
                        className={clsx(
                          'w-4 h-4 shrink-0',
                          current
                            ? isLight
                              ? 'text-emerald-600'
                              : 'text-emerald-300'
                            : isLight
                              ? 'text-blue-600'
                              : 'text-blue-300',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="ak-text-1 text-sm font-semibold truncate">
                            {h.hostName}
                          </span>
                          {current ? (
                            <span
                              className={clsx(
                                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                                isLight
                                  ? 'bg-emerald-600/15 text-emerald-800'
                                  : 'bg-emerald-500/20 text-emerald-300',
                              )}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              已连接
                            </span>
                          ) : onlineOnLan ? (
                            <span
                              className={clsx(
                                'px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                                isLight
                                  ? 'bg-blue-600/15 text-blue-700'
                                  : 'bg-blue-500/20 text-blue-300',
                              )}
                            >
                              局域网在线
                            </span>
                          ) : null}
                        </div>
                        <div className="ak-text-2 text-[11px] font-mono truncate">{h.addrs[0]}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => forgetHost(h.hostId)}
                      className="p-2 rounded-xl ak-text-3 hover:text-rose-500"
                      aria-label="移除已配对电脑"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Discovered Unpaired LAN Hosts Hint */}
        {unpairedDiscovered.length > 0 && (
          <div
            className={clsx(
              'p-3 rounded-2xl border space-y-1',
              isLight
                ? 'bg-blue-600/8 border-blue-500/25'
                : 'bg-blue-500/10 border-blue-400/25',
            )}
          >
            <div className={clsx('text-xs font-semibold', isLight ? 'text-blue-800' : 'text-blue-200')}>
              发现局域网电脑：{unpairedDiscovered.map((d) => d.hostName).join('、')}
            </div>
            <div className="ak-text-2 text-[11px]">
              首次连接请在电脑端 Axonkey 打开配对二维码，点击上方按钮扫码建立加密信任；此后同一局域网将自动重连。
            </div>
          </div>
        )}

        {/* Paste Fallback for Debug / Manual Pairing */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="或粘贴电脑端配对口令 JSON…"
              className="ak-input flex-1 h-10 px-3 rounded-xl border text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              disabled={!qrInput.trim()}
              onClick={() => submitQrText(qrInput)}
              className="ak-elevated ak-text-1 h-10 px-3.5 rounded-xl border disabled:opacity-40 text-xs font-semibold"
            >
              配对
            </button>
          </div>
          {parseError && <p className="text-xs text-rose-500">{parseError}</p>}
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            connectDemo()
            setOpen(false)
          }}
          className="ak-pill ak-text-2 w-full h-10 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5"
        >
          <Radio className={clsx('w-3.5 h-3.5', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
          <span>{isDemoMode ? '当前处于本地模拟体验模式' : '切换到本地模拟体验模式'}</span>
        </button>
      </div>
    </div>
  )
}
