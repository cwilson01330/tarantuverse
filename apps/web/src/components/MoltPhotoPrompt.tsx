'use client'

/**
 * MoltPhotoPrompt - offered once after a new molt is saved ("Add a photo of
 * the new molt?"). Never forced: "Not now" just carries on. The tick box means
 * "don't ask after molts"; it is reported through onClose/onChoose and the
 * caller stores it whichever button was pressed. No camera button on web.
 */
import { useEffect, useState } from 'react'

export interface MoltPhotoPromptProps {
  onChoose: (dontAskAgain: boolean) => void
  onClose: (dontAskAgain: boolean) => void
}

export default function MoltPhotoPrompt({ onChoose, onClose }: MoltPhotoPromptProps) {
  const [dontAsk, setDontAsk] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(dontAsk) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dontAsk, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onClose(dontAsk)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="molt-photo-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-theme bg-surface p-5 shadow-xl"
      >
        <h2 id="molt-photo-prompt-title" className="text-lg font-bold text-theme-primary">
          Add a photo of the new molt?
        </h2>
        <p className="mt-1 text-sm text-theme-secondary">
          A photo now makes the photo timeline show growth molt by molt.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onChoose(dontAsk)}
            className="w-full py-2.5 bg-gradient-brand text-white rounded-xl font-semibold"
          >
            Choose photo
          </button>
          <button
            type="button"
            onClick={() => onClose(dontAsk)}
            className="w-full py-2.5 rounded-xl border border-theme bg-surface text-theme-secondary font-semibold hover:bg-surface-elevated"
          >
            Not now
          </button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-theme-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="h-4 w-4 rounded border-theme"
          />
          Don&apos;t ask after molts
        </label>
      </div>
    </div>
  )
}
