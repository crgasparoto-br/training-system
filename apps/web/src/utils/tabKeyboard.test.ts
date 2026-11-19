// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleTabListKeyDown } from './tabKeyboard';

function createTabs() {
  const tablist = document.createElement('div');
  tablist.setAttribute('role', 'tablist');
  const tabs = ['Primeira', 'Segunda', 'Terceira'].map((name, index) => {
    const button = document.createElement('button');
    button.textContent = name;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(index === 0));
    button.tabIndex = index === 0 ? 0 : -1;
    tablist.append(button);
    return button;
  });
  tabs.forEach((button) => button.addEventListener('click', () => {
    tabs.forEach((tab) => {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }));
  document.body.append(tablist);

  const keydown = (from: number, key: string) => {
    const preventDefault = vi.fn();
    handleTabListKeyDown({
      key,
      currentTarget: tabs[from],
      preventDefault,
    } as unknown as Parameters<typeof handleTabListKeyDown>[0]);
    return preventDefault;
  };
  return { tabs, keydown };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('handleTabListKeyDown', () => {
  it('move foco e seleção com ArrowRight e contorna o último item', () => {
    const { tabs, keydown } = createTabs();
    expect(keydown(0, 'ArrowRight')).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    keydown(2, 'ArrowRight');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('contorna o primeiro item com ArrowLeft e ignora abas desabilitadas', () => {
    const { tabs, keydown } = createTabs();
    tabs[1].disabled = true;
    keydown(0, 'ArrowLeft');
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
  });

  it('suporta Home e End usando a seleção existente', () => {
    const { tabs, keydown } = createTabs();
    keydown(0, 'End');
    expect(document.activeElement).toBe(tabs[2]);
    keydown(2, 'Home');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('não intercepta Tab nem Enter', () => {
    const { tabs, keydown } = createTabs();
    expect(keydown(0, 'Tab')).not.toHaveBeenCalled();
    expect(keydown(0, 'Enter')).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(tabs[1]);
  });
});
