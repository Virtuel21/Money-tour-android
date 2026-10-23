import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CardBack, DRAWN_CARD_EXIT_MS } from './DrawnCard';
import { GameIcon, type GameIconName } from './GameIcon';
import { restoreDialogFocus, trapDialogFocus } from './dialogFocus';
import { CARD_EXIT_MS, CARD_MOTION_STYLE } from './cardMotion';
import { translate } from '../i18n/translate';
import './action-card.css';

export const ACTION_CARD_EXIT_MS = CARD_EXIT_MS;

export interface ActionCardController {
  /** Leave the screen before applying the selected action; repeated calls are ignored. */
  run: (action: () => void) => void;
  leaving: boolean;
}

type CardContent = ReactNode | ((card: ActionCardController) => ReactNode);

export interface ActionCardProps {
  /** The decision's identity, excluding countdown ticks or intermediate form state. */
  cardKey: string | number;
  title: string;
  ownerLabel?: string;
  icon?: GameIconName;
  /** Always-visible status, such as the active decision's countdown. */
  status?: ReactNode;
  children: CardContent;
  footer?: CardContent;
  onClose?: () => void;
  reducedMotion?: boolean;
}

const ActionCardContext = createContext<ActionCardController | null>(null);
const ActionCardFooterContext = createContext<HTMLDivElement | null | undefined>(undefined);

/** Keep decision controls visible while their explanation scrolls; standalone views stay inline. */
export function ActionCardActions({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const host = useContext(ActionCardFooterContext);
  if (host === undefined) return children;
  if (!host) return null;
  return createPortal(<div className={`action-card-actions ${className}`}>{children}</div>, host);
}

export function useActionCard(): ActionCardController {
  const card = useContext(ActionCardContext);
  if (!card) throw new Error('useActionCard must be used inside an ActionCard');
  return card;
}

/** A fresh decision gets a fresh physical card and cancels any old pending action. */
export function ActionCard(props: ActionCardProps) {
  return <ActionCardDialog key={props.cardKey} {...props} />;
}

function ActionCardDialog({
  title,
  ownerLabel,
  icon = 'card',
  status,
  children,
  footer,
  onClose,
  reducedMotion = false,
}: ActionCardProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const departing = useRef(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [footerHost, setFooterHost] = useState<HTMLDivElement | null>(null);

  const finishDeparture = useCallback(() => {
    if (!mounted.current || !pendingAction.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const action = pendingAction.current;
    pendingAction.current = null;
    try {
      action();
    } finally {
      // A rejected move or a partial debt payment can retain the same decision.
      // Re-enter in that case instead of leaving the surviving controls disabled.
      if (mounted.current) {
        departing.current = false;
        setLeaving(false);
      }
    }
  }, []);

  const run = useCallback(
    (action: () => void) => {
      if (departing.current || !mounted.current) return;
      departing.current = true;
      pendingAction.current = action;
      setLeaving(true);
      if (reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        finishDeparture();
      } else {
        timer.current = setTimeout(finishDeparture, DRAWN_CARD_EXIT_MS);
      }
    },
    [finishDeparture, reducedMotion],
  );

  useEffect(() => {
    mounted.current = true;
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
      pendingAction.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      dialog?.close();
      restoreDialogFocus(opener);
    };
  }, []);

  useEffect(() => {
    if (!leaving) titleRef.current?.focus({ preventScroll: true });
  }, [leaving]);

  const card = { run, leaving };
  const renderContent = (content: CardContent) =>
    typeof content === 'function' ? content(card) : content;

  return (
    <ActionCardContext.Provider value={card}>
      <ActionCardFooterContext.Provider value={footerHost}>
        <dialog
          ref={dialogRef}
          style={CARD_MOTION_STYLE}
          className={`drawn-card-dialog drawn-card-event action-card-dialog${reducedMotion ? ' motion-reduced' : ''}${leaving ? ' is-leaving' : ''}`}
          aria-labelledby={titleId}
          aria-modal="true"
          aria-busy={leaving || undefined}
          onKeyDown={trapDialogFocus}
          onCancel={(event) => {
            event.preventDefault();
            if (onClose) run(onClose);
          }}
        >
          <div
            className="drawn-card-motion"
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === 'drawn-card-depart'
              )
                finishDeparture();
            }}
          >
            <CardBack />
            <article className="drawn-card-front action-card-front">
              <div className="drawn-card-owner action-card-owner">
                <GameIcon name={icon} />
                {ownerLabel && <span>{ownerLabel}</span>}
                <span className="drawn-card-brand" aria-hidden="true">
                  MONEY <b>TOUR</b>
                </span>
                {onClose && (
                  <button
                    type="button"
                    className="action-card-close"
                    aria-label={translate('Fermer')}
                    onClick={() => run(onClose)}
                    disabled={leaving}
                  >
                    <GameIcon name="close" />
                  </button>
                )}
              </div>
              {status && <div className="action-card-status">{status}</div>}
              <fieldset
                className="action-card-fieldset"
                disabled={leaving}
                aria-labelledby={titleId}
              >
                <div className="action-card-content" tabIndex={0}>
                  <h2 id={titleId} ref={titleRef} tabIndex={-1}>
                    {title}
                  </h2>
                  {renderContent(children)}
                </div>
                <div className="action-card-footer" ref={setFooterHost}>
                  {footer && renderContent(footer)}
                </div>
              </fieldset>
            </article>
          </div>
        </dialog>
      </ActionCardFooterContext.Provider>
    </ActionCardContext.Provider>
  );
}
