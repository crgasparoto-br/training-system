import type { KeyboardEvent } from 'react';

/** Roving focus com seleção pelo mesmo clique usado em mouse e toque. */
export function handleTabListKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
  const key = event.key;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;

  const tablist = event.currentTarget.closest('[role="tablist"]');
  const tabs = Array.from(
    tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? [],
  );
  const current = tabs.indexOf(event.currentTarget);
  if (current < 0 || tabs.length === 0) return;

  let next = current;
  if (key === 'ArrowRight') next = (current + 1) % tabs.length;
  if (key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  if (key === 'Home') next = 0;
  if (key === 'End') next = tabs.length - 1;

  event.preventDefault();
  tabs[next].focus();
  if (next !== current) tabs[next].click();
}
