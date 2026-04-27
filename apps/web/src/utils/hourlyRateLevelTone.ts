function normalizeLabel(label?: string) {
  return (label ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function getHourlyRateLevelBadgeClassName(label?: string) {
  const normalizedLabel = normalizeLabel(label);

  if (!normalizedLabel) {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }

  if (normalizedLabel.includes('nao configur') || normalizedLabel.includes('pendente')) {
    return 'bg-amber-100 text-amber-800 ring-amber-200';
  }

  if (normalizedLabel.includes('nao classif') || normalizedLabel.includes('sem faixa')) {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }

  if (normalizedLabel.includes('diamante') || normalizedLabel.includes('diamond')) {
    return 'bg-cyan-100 text-cyan-800 ring-cyan-200';
  }

  if (normalizedLabel.includes('ouro') || normalizedLabel.includes('gold') || normalizedLabel.includes('dourad')) {
    return 'bg-yellow-100 text-yellow-800 ring-yellow-200';
  }

  if (normalizedLabel.includes('prata') || normalizedLabel.includes('silver')) {
    return 'bg-slate-200 text-slate-700 ring-slate-300';
  }

  if (normalizedLabel.includes('bronze') || normalizedLabel.includes('cobre')) {
    return 'bg-orange-100 text-orange-800 ring-orange-200';
  }

  if (normalizedLabel.includes('platina') || normalizedLabel.includes('platinum')) {
    return 'bg-indigo-100 text-indigo-800 ring-indigo-200';
  }

  if (normalizedLabel.includes('esmeralda') || normalizedLabel.includes('emerald') || normalizedLabel.includes('verde')) {
    return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  }

  if (normalizedLabel.includes('safira') || normalizedLabel.includes('sapphire') || normalizedLabel.includes('azul')) {
    return 'bg-blue-100 text-blue-800 ring-blue-200';
  }

  if (normalizedLabel.includes('rubi') || normalizedLabel.includes('ruby') || normalizedLabel.includes('vermelh')) {
    return 'bg-rose-100 text-rose-800 ring-rose-200';
  }

  if (normalizedLabel.includes('preto') || normalizedLabel.includes('black') || normalizedLabel.includes('negro')) {
    return 'bg-zinc-800 text-zinc-100 ring-zinc-700';
  }

  if (normalizedLabel.includes('premium') || normalizedLabel.includes('vip')) {
    return 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200';
  }

  return 'bg-primary/10 text-primary ring-primary/15';
}