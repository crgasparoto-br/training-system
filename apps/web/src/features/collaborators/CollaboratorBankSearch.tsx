import { useEffect, useMemo, useRef, useState } from 'react';
import type { BankOption } from '@corrida/types';

function normalize(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function CollaboratorBankSearch({
  banks,
  value,
  onChange,
  disabled,
  error,
}: {
  banks: BankOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    const selected = banks.find((bank) => bank.code === value);
    setSearch(selected ? `${selected.code} - ${selected.description}` : value);
  }, [banks, value]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const visibleBanks = useMemo(() => {
    const term = normalize(search.trim());
    if (!term || banks.some((bank) => `${bank.code} - ${bank.description}` === search)) {
      return banks.slice(0, 30);
    }
    return banks
      .filter((bank) => normalize(`${bank.code} ${bank.description}`).includes(term))
      .slice(0, 30);
  }, [banks, search]);

  useEffect(() => {
    if (highlightedIndex >= visibleBanks.length) {
      setHighlightedIndex(visibleBanks.length > 0 ? visibleBanks.length - 1 : -1);
    }
  }, [highlightedIndex, visibleBanks.length]);

  const selectBank = (bank: BankOption) => {
    onChange(bank.code);
    setSearch(`${bank.code} - ${bank.description}`);
    setOpen(false);
    setHighlightedIndex(-1);
  };

  const commitTypedValue = () => {
    const normalizedSearch = search.trim();
    const exact = banks.find(
      (bank) =>
        bank.code === normalizedSearch ||
        `${bank.code} - ${bank.description}` === normalizedSearch
    );
    if (exact) {
      selectBank(exact);
      return;
    }
    if (!normalizedSearch) onChange('');
    else {
      const selected = banks.find((bank) => bank.code === value);
      setSearch(selected ? `${selected.code} - ${selected.description}` : '');
    }
  };

  return (
    <div ref={wrapperRef} className="relative space-y-2">
      <label htmlFor="collaborator-bank" className="block text-sm font-medium text-foreground">
        Banco
      </label>
      <input
        id="collaborator-bank"
        role="combobox"
        aria-expanded={open}
        aria-controls="collaborator-bank-options"
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlightedIndex >= 0
            ? `collaborator-bank-option-${highlightedIndex}`
            : undefined
        }
        autoComplete="off"
        disabled={disabled}
        value={search}
        placeholder="Pesquise por código ou nome"
        className="flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted"
        onFocus={() => {
          setOpen(true);
          setHighlightedIndex(visibleBanks.findIndex((bank) => bank.code === value));
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onBlur={() => window.setTimeout(commitTypedValue, 0)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setHighlightedIndex(-1);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setHighlightedIndex((current) =>
              visibleBanks.length === 0 ? -1 : current < visibleBanks.length - 1 ? current + 1 : 0
            );
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setHighlightedIndex((current) =>
              visibleBanks.length === 0 ? -1 : current > 0 ? current - 1 : visibleBanks.length - 1
            );
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            const selected = visibleBanks[highlightedIndex] ?? visibleBanks[0];
            if (selected) selectBank(selected);
          }
        }}
      />
      {open && !disabled ? (
        <div
          id="collaborator-bank-options"
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover p-2 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('');
              setSearch('');
              setOpen(false);
              setHighlightedIndex(-1);
            }}
          >
            Selecionar depois
          </button>
          {visibleBanks.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum banco encontrado.</p>
          ) : (
            visibleBanks.map((bank, index) => (
              <button
                key={bank.code}
                id={`collaborator-bank-option-${index}`}
                type="button"
                role="option"
                aria-selected={bank.code === value}
                className={`mt-1 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${
                  highlightedIndex === index ? 'bg-primary/10 text-primary' : ''
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectBank(bank)}
              >
                <span className="block font-medium">{bank.code}</span>
                <span className="block text-muted-foreground">{bank.description}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
