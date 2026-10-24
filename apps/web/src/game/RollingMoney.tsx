import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { numberLocale } from '../i18n/language';
import './rolling-money.css';

export const MONEY_ROLL_MS = 820;
const motionQuery = '(prefers-reduced-motion: reduce)';
const modulo = (value: number) => ((value % 10) + 10) % 10;

/** Bound each drum's travel, even when a large rent changes thousands of units. */
export function moneyWheelEnd(start: number, digit: number, direction: number, carry: boolean) {
  if (!direction) return digit;
  const distance = modulo(direction > 0 ? digit - start : start - digit);
  return start + Math.sign(direction) * (distance + (carry && distance < 0.001 ? 10 : 0));
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(motionQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(motionQuery);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

interface Token {
  key: string;
  text: string;
  place?: number;
}

function formattedMoney(compact: boolean) {
  return new Intl.NumberFormat(numberLocale(), {
    maximumFractionDigits: compact ? 0 : 2,
    ...(compact ? { notation: 'compact' } : {}),
  });
}

function moneyParts(value: number, compact: boolean) {
  const formatter = formattedMoney(compact);
  const parts = formatter.formatToParts(value);
  const integer = parts
    .filter((part) => part.type === 'integer')
    .map((part) => part.value)
    .join('');
  const fraction = parts.find((part) => part.type === 'fraction')?.value ?? '';
  return {
    text: formatter.format(value),
    integer,
    fraction,
    magnitude: Number(`${integer}.${fraction}`),
    unit: parts.find((part) => part.type === 'compact')?.value ?? '',
  };
}

function moneyTokens(value: number, compact: boolean) {
  const actual = moneyParts(value, compact);
  const parts = formattedMoney(compact).formatToParts(value);
  let integerPlace = actual.integer.length - 1;
  let fractionPlace = -1;
  const tokens: Token[] = [];
  for (const part of parts) {
    if (part.type === 'integer' || part.type === 'fraction') {
      for (const text of part.value) {
        const place = part.type === 'integer' ? integerPlace-- : fractionPlace--;
        tokens.push({
          key: `digit:${place}`,
          text,
          place,
        });
      }
    } else {
      tokens.push({
        key: `${part.type}:${integerPlace}`,
        text: part.value,
      });
    }
  }
  return tokens;
}

/** Visual cash only: game rules and accessible text always use the authoritative total. */
export function RollingMoney({ value, compact = false }: { value: number; compact?: boolean }) {
  const amount = moneyParts(value, compact);
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const wheels = useRef(new Map<number, HTMLSpanElement>());
  const positions = useRef(new Map<number, number>());
  const activePlaces = useRef(new Set<number>());
  const previous = useRef({ value, magnitude: amount.magnitude, unit: amount.unit, initial: true });
  const tokens = moneyTokens(value, compact);

  useLayoutEffect(() => {
    const before = previous.current;
    const animate =
      !before.initial && !reduced && before.value !== value && before.unit === amount.unit;
    const direction =
      Math.sign(amount.magnitude - before.magnitude) || Math.sign(value - before.value);
    const runs = tokens
      .filter((token) => token.place !== undefined)
      .map((token) => {
        const place = token.place!;
        const endDigit = Number(token.text);
        const start =
          (activePlaces.current.has(place) ? positions.current.get(place) : undefined) ??
          (animate ? 0 : endDigit);
        const scale = 10 ** place;
        const carry =
          Math.floor((before.magnitude + Number.EPSILON) / scale) !==
          Math.floor((amount.magnitude + Number.EPSILON) / scale);
        return {
          place,
          start,
          end: animate ? moneyWheelEnd(start, endDigit, direction, carry) : endDigit,
        };
      });
    activePlaces.current = new Set(runs.map((run) => run.place));
    previous.current = { value, magnitude: amount.magnitude, unit: amount.unit, initial: false };
    let frame = 0;
    const paint = (progress: number) => {
      for (const run of runs) {
        const position = run.start + (run.end - run.start) * progress;
        positions.current.set(run.place, modulo(position));
        const wheel = wheels.current.get(run.place);
        if (wheel) wheel.style.transform = `translate3d(0, ${-modulo(position)}em, 0)`;
      }
    };
    const moving = animate && runs.some((run) => Math.abs(run.end - run.start) > 0.001);
    rootRef.current?.setAttribute('data-rolling', String(moving));
    rootRef.current?.setAttribute('data-direction', value >= before.value ? 'gain' : 'loss');
    if (moving) {
      const started = performance.now();
      paint(0);
      const tick = (now: number) => {
        const elapsed = Math.max(0, Math.min(1, (now - started) / MONEY_ROLL_MS));
        paint(1 - (1 - elapsed) ** 3);
        if (elapsed < 1) frame = requestAnimationFrame(tick);
        else rootRef.current?.setAttribute('data-rolling', 'false');
      };
      frame = requestAnimationFrame(tick);
    } else paint(1);
    return () => cancelAnimationFrame(frame);
    // Token layout is derived entirely from these values; frames never rerender React.
  }, [value, compact, reduced, amount.text, amount.unit, amount.magnitude]);

  return (
    <span className="money-odometer" ref={rootRef} data-value={value}>
      <span className="money-odometer-value sr-only">{amount.text}</span>
      <span className="money-odometer-visual" aria-hidden="true">
        {tokens.map((token) => (
          <span
            className={token.place === undefined ? 'money-odometer-mark' : 'money-odometer-slot'}
            key={token.key}
            data-place={token.place}
          >
            {token.place === undefined ? (
              token.text
            ) : (
              <span
                className="money-odometer-tape"
                ref={(node) => {
                  if (node) wheels.current.set(token.place!, node);
                  else wheels.current.delete(token.place!);
                }}
              />
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
