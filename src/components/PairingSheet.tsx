import { useEffect, useState } from 'react'
import { Check, QrCode, RefreshCw, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { BottomSheet } from './BottomSheet'
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

  const [nameDraft, setNameDraft] = useState(localFeel.deviceName)
  const [qrInput, setQrInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    setNameDraft(localFeel.deviceName)
  }, [localFeel.deviceName, open])

  const saveDeviceName = () => {
    const cleaned = nameDraft.trim().slice(0, 48) || getDefaultPhoneName()
    setNameDraft(cleaned)
    if (cleaned !== localFeel.deviceName) {
      updateLocalFeel({ deviceName: cleaned })
      triggerHaptic('confirm')
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
      setParseError('浏览器模式请粘贴下方配对口令')
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="设备连接"
      closeAriaLabel="关闭"
      testId="pairing-sheet-backdrop"
    >
      <button
        type="button"
        onClick={handleScan}
        className="ak-primary-solid w-full h-11 rounded-[18px] border font-semibold text-xs inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <QrCode className="w-4 h-4" />
        <span>{isNativeShell() ? '扫码连接新电脑' : '扫码连接（原生 App）'}</span>
      </button>

      {savedHosts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="ak-text-2 font-medium">已配对电脑</span>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                discoverAndReconnect(650)
              }}
              className="ak-text-2 inline-flex items-center gap-1 text-[11px] font-medium"
            >
              <RefreshCw className={clsx('w-3 h-3', discoveringLan && 'animate-spin')} />
              <span>{discoveringLan ? '扫描中…' : '刷新局域网'}</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {savedHosts.map((h) => {
              const current = !isDemoMode && hostId === h.hostId && phase === 'active'
              const onlineOnLan = discoveredIds.has(h.hostId)
              return (
                <div
                  key={h.hostId}
                  className="ak-well flex items-center justify-between gap-2 px-3 py-2.5 rounded-[18px] border"
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap')
                      connectSavedHost(h)
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <span
                      className={clsx(
                        'w-2 h-2 rounded-full shrink-0',
                        current
                          ? 'ak-live-dot'
                          : onlineOnLan
                            ? 'bg-sky-400'
                            : 'bg-[#58585e]',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="ak-text-1 text-xs font-semibold truncate">
                        {h.hostName}
                      </div>
                      <div className="ak-text-2 text-[10.5px] font-mono truncate">
                        {h.addrs[0]}
                        {current ? ' · 已加密连接' : onlineOnLan ? ' · 在线' : ''}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => forgetHost(h.hostId)}
                    className="p-1.5 rounded-xl ak-text-3 hover:text-rose-500"
                    aria-label="移除已配对电脑"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {unpairedDiscovered.length > 0 && (
        <div className="ak-well px-3 py-2 rounded-[16px] border text-xs ak-text-2 truncate">
          局域网发现：{unpairedDiscovered.map((d) => d.hostName).join('、')}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="ak-text-2 text-xs font-medium shrink-0">本机名称</span>
        <div className="flex items-center gap-1.5 flex-1 max-w-[220px]">
          <input
            type="text"
            value={nameDraft}
            maxLength={48}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveDeviceName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder={getDefaultPhoneName()}
            className="ak-input flex-1 min-w-0 h-9 px-3 rounded-[14px] border text-xs focus:outline-none"
          />
          {nameDraft.trim() !== localFeel.deviceName && (
            <button
              type="button"
              onClick={saveDeviceName}
              aria-label="保存本机名称"
              className="ak-primary-solid h-9 w-9 rounded-[14px] border inline-flex items-center justify-center shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder="粘贴配对口令 JSON…"
            className="ak-input flex-1 h-9 px-3 rounded-[14px] border text-xs focus:outline-none"
          />
          <button
            type="button"
            disabled={!qrInput.trim()}
            onClick={() => submitQrText(qrInput)}
            className="ak-elevated ak-text-1 h-9 px-3.5 rounded-[14px] border disabled:opacity-40 text-xs font-medium"
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
        className="ak-well ak-text-2 w-full h-9 rounded-[14px] border text-xs font-medium"
      >
        {isDemoMode ? '模拟体验中' : '切换为本地模拟体验'}
      </button>
    </BottomSheet>
  )
}
