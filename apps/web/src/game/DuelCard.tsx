import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '@money-tour/engine';
import { translate } from '../i18n/translate';
import { ActionCard, type ActionCardController } from './ActionCard';
import { ActionClock } from './ActionClock';
import { DuelView } from './DuelView';
import type { Cue } from './presentation';

export function isDuelNotice(cue: Cue) {
  return (
    cue.kind === 'notice' &&
    ['duel_result', 'duel_cancelled', 'duel_forfeit'].includes(cue.reason ?? '')
  );
}

/** Tie rounds rotate their secret id, whereas a new first round is a new encounter. */
export function useDuelEncounterKey(journey: string | number, state: GameState) {
  const encounter = useRef<{ scope: string; initialId: string; key: string } | null>(null);
  if (!state.duel) return null;
  const scope = `${journey}:${state.turn}:${state.duel.challengerId}`;
  if (
    !encounter.current ||
    encounter.current.scope !== scope ||
    ((state.duel.round ?? 1) === 1 && encounter.current.initialId !== state.duel.id)
  ) {
    encounter.current = { scope, initialId: state.duel.id, key: `${scope}:${state.duel.id}` };
  }
  return encounter.current.key;
}

interface DuelCardProps {
  state: GameState;
  liveState: GameState;
  journey: string | number;
  cue: Cue;
  busy: boolean;
  disabled: boolean;
  self?: string;
  hidden?: boolean;
  reducedMotion?: boolean;
  onClose?: () => void;
  act: (action: GameAction) => void;
  dismissResult: () => void;
}

/** A duel is one physical card; secret rounds and decision owners only change its contents. */
export function DuelCard(props: DuelCardProps) {
  const { state, liveState, cue, busy } = props;
  const latest = useRef<{ key: string; state: GameState } | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const encounterKey = useDuelEncounterKey(props.journey, state);
  const notice = isDuelNotice(cue);
  // A spectator who hid the card must not get a fresh arrival merely for its final outro.
  if (props.hidden) {
    latest.current = null;
    return null;
  }
  const visibleDuel =
    state.duel && (!busy || notice || (cue.kind === 'money' && cue.reason === 'duel_stake'));
  if (visibleDuel && encounterKey) {
    const key = encounterKey;
    if (closed !== key) latest.current = { key, state: liveState.duel ? liveState : state };
  }
  const snapshot = latest.current;
  if (!snapshot || closed === snapshot.key) return null;
  const active = !!liveState.duel || notice;
  const live = liveState.duel ? liveState : snapshot.state;
  const player = live.players.find((p) => p.id === live.duel!.challengerId)!;
  const dismiss = () => {
    setClosed(snapshot.key);
    latest.current = null;
  };
  return (
    <ActionCard
      cardKey={snapshot.key}
      title={translate('Duel')}
      ownerLabel={player.name}
      icon="target"
      status={notice ? undefined : <ActionClock full />}
      reducedMotion={props.reducedMotion}
      onClose={props.onClose}
      footer={
        notice
          ? (card) => (
              <button
                className="primary"
                onClick={() => {
                  if (liveState.duel) props.dismissResult();
                  else
                    card.run(() => {
                      props.dismissResult();
                      dismiss();
                    });
                }}
              >
                {translate(liveState.duel ? 'Manche suivante' : 'Continuer')}
              </button>
            )
          : undefined
      }
    >
      {(card) => (
        <DuelContents card={card} active={active} onDeparted={dismiss}>
          {notice ? (
            <p className="event-notice">{translate(cue.message)}</p>
          ) : (
            <DuelView
              key={live.duel!.id}
              state={live}
              self={props.self}
              disabled={props.disabled || busy || !liveState.duel}
              act={(action) => {
                if (action.type === 'duel_decline' || action.type === 'duel_cancel')
                  card.run(() => {
                    props.act(action);
                    dismiss();
                  });
                else props.act(action);
              }}
            />
          )}
        </DuelContents>
      )}
    </ActionCard>
  );
}

function DuelContents({
  card,
  active,
  onDeparted,
  children,
}: {
  card: ActionCardController;
  active: boolean;
  onDeparted: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!active) card.run(onDeparted);
  }, [active, card, onDeparted]);
  return children;
}
