import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { restoreDialogFocus, trapDialogFocus } from './dialogFocus';
import { GameIcon } from './GameIcon';
import './drawn-card.css';

export const DRAWN_CARD_EXIT_MS = 420;

export interface DrawnCardProps {
  /** Identity of this draw, including successive draws of the same card. */
  cardKey: string | number;
  title: string;
  description?: string;
  ownerLabel: string;
  actionLabel: string;
  onDismiss: () => void;
  reducedMotion?: boolean;
  tone?: 'chance' | 'tax' | 'event';
  artwork?: string;
  artworkAlt?: string;
  children?: ReactNode;
}

/** Remount the physical card when a new draw arrives, cancelling any previous departure. */
export function DrawnCard(props: DrawnCardProps) {
  return <DrawnCardDialog key={props.cardKey} {...props} />;
}

function CardBack() {
  return (
    <div className="drawn-card-back" aria-hidden="true">
      <span className="drawn-card-back-brand">
        MONEY <b>TOUR</b>
      </span>
      <svg className="drawn-card-compass" viewBox="0 0 240 260" focusable="false">
        <path
          className="drawn-card-route"
          d="M18 210Q100 226 81 168T160 64Q201 76 220 36M22 43q45-20 63 12m95 143q21-15 42-4"
        />
        <circle cx="120" cy="130" r="76" />
        <circle cx="120" cy="130" r="62" />
        <path d="M120 38v20m0 144v20M28 130h20m144 0h20M55 65l14 14m102 102 14 14M55 195l14-14M171 79l14-14" />
        <path
          className="drawn-card-compass-light"
          d="m120 68 16 46 46 16-46 16-16 46-16-46-46-16 46-16Z"
        />
        <path
          className="drawn-card-compass-dark"
          d="m120 68 0 62 16-16Zm62 62h-62l16 16Zm-62 62v-62l-16 16Zm-62-62h62l-16-16Z"
        />
        <circle cx="120" cy="130" r="8" className="drawn-card-compass-center" />
      </svg>
      <span className="drawn-card-back-emblem">
        <GameIcon name="island" />
      </span>
    </div>
  );
}

function DrawnCardDialog({
  title,
  description,
  ownerLabel,
  actionLabel,
  onDismiss,
  reducedMotion = false,
  tone = 'chance',
  artwork = import.meta.env.BASE_URL + 'textures/chance.webp',
  artworkAlt = '',
  children,
}: DrawnCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const departing = useRef(false);
  const dismissed = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const [leaving, setLeaving] = useState(false);

  const finishDeparture = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    onDismissRef.current();
  }, []);

  const depart = useCallback(() => {
    if (departing.current) return;
    departing.current = true;
    setLeaving(true);
    // Match the OS preference as well as the in-game comfort setting. CSS alone would leave
    // a motion-sensitive player waiting for a departure animation they cannot see.
    if (reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finishDeparture();
    } else {
      // The fallback also completes when animation events are suppressed by the browser.
      timer.current = setTimeout(finishDeparture, DRAWN_CARD_EXIT_MS);
    }
  }, [finishDeparture, reducedMotion]);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      dialog?.close();
      restoreDialogFocus(opener);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`drawn-card-dialog drawn-card-${tone}${reducedMotion ? ' motion-reduced' : ''}${leaving ? ' is-leaving' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        depart();
      }}
    >
      <div
        className="drawn-card-motion"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === 'drawn-card-depart')
            finishDeparture();
        }}
      >
        <CardBack />
        <article className="drawn-card-front">
          <header className="drawn-card-owner">
            <GameIcon name={tone === 'tax' ? 'coin' : 'card'} />
            <span>{ownerLabel}</span>
            <span className="drawn-card-brand" aria-hidden="true">
              MONEY <b>TOUR</b>
            </span>
          </header>
          <div className="drawn-card-content" tabIndex={0}>
            <div className="drawn-card-artwork">
              <img src={artwork} alt={artworkAlt} draggable={false} />
            </div>
            <div className="drawn-card-copy">
              <h2 id={titleId} ref={titleRef} tabIndex={-1}>
                {title}
              </h2>
              {description && <p id={descriptionId}>{description}</p>}
              {children && <div className="drawn-card-detail">{children}</div>}
            </div>
          </div>
          <div className="drawn-card-footer">
            <span className="drawn-card-footer-mark" aria-hidden="true">
              <GameIcon name="compass" />
            </span>
            <button
              type="button"
              className="drawn-card-continue"
              onClick={depart}
              disabled={leaving}
            >
              {actionLabel}
            </button>
          </div>
        </article>
      </div>
    </dialog>
  );
}
