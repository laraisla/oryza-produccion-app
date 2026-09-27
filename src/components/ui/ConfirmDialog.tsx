import { useState } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'primary' | 'danger' | 'success';
  /** Si se indica, se muestra un campo de texto (comentario / motivo). */
  textLabel?: string;
  textRequired?: boolean;
  textPlaceholder?: string;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  tone = 'primary',
  textLabel,
  textRequired,
  textPlaceholder,
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean, text: string) => void }) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = !!textRequired && !text.trim();
  const btn = tone === 'danger' ? 'btn-danger' : tone === 'success' ? 'btn-success' : 'btn-primary';
  return (
    <Modal
      title={title}
      size="sm"
      onClose={() => onClose(false, '')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => onClose(false, '')}>
            Cancelar
          </button>
          <button
            className={`btn ${btn}`}
            data-autofocus
            onClick={() => {
              setTouched(true);
              if (!invalid) onClose(true, text);
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>
      {textLabel && (
        <div className="mt-4">
          <label className="label" htmlFor="confirm-text">
            {textLabel} {textRequired && <span className="text-bad">*</span>}
          </label>
          <textarea
            id="confirm-text"
            className={`textarea ${touched && invalid ? 'input-error' : ''}`}
            value={text}
            placeholder={textPlaceholder}
            onChange={(e) => setText(e.target.value)}
          />
          {touched && invalid && <p className="mt-1 text-xs text-bad-text">Este dato es obligatorio.</p>}
        </div>
      )}
    </Modal>
  );
}
