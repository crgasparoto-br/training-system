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

  useEffect(() => {
    const selected = banks.find((bank) => bank.code === value);
    setSearch(selected ? `${selected.code} - ${selected.description}` : value);
  }, [banks, value]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
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

  const commitTypedValue = () => {
    const normalizedSearch = search.trim();
    const exact = banks.find(
      (bank) =>
        bank.code === normalizedSearch ||
        `${bank.code} - ${bank.description}` === normalizedSearch
    );
    if (exact) {
      onChange(exact.code);
      setSearch(`${exact.code} - ${exact.description}`);
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
        autoComplete="off"
        disabled={disabled}
        value={search}
        placeholder="Pesquise por código ou nome"
        className="flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(commitTypedValue, 0)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter') {
            event.preventDefault();
            const first = visibleBanks[0];
            if (first) {
              onChange(first.code);
              setSearch(`${first.code} - ${first.description}`);
              setOpen(false);
            }
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
            }}
          >
            Selecionar depois
          </button>
          {visibleBanks.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum banco encontrado.</p>
          ) : (
            visibleBanks.map((bank) => (
              <button
                key={bank.code}
                type="button"
                role="option"
                aria-selected={bank.code === value}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(bank.code);
                  setSearch(`${bank.code} - ${bank.description}`);
                  setOpen(false);
                }}
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
