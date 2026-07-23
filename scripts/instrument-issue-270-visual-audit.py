from pathlib import Path

path = Path('apps/api/scripts/visual-audit-issue-270.mjs')
source = path.read_text()
needle = """  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (overflow.scrollWidth > overflow.width + 1) {
    throw new Error(`${name}: overflow horizontal (${overflow.scrollWidth}px > ${overflow.width}px)`);
  }
"""
replacement = """  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (overflow.scrollWidth > overflow.width + 1) {
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            display: style.display,
            position: style.position,
            transform: style.transform,
            text: (element.textContent || '').trim().slice(0, 100),
          };
        })
        .filter(
          (item) =>
            item.right > window.innerWidth + 1 ||
            item.left < -1 ||
            item.scrollWidth > item.width + 1
        )
        .sort(
          (a, b) =>
            Math.max(b.right - window.innerWidth, -b.left, b.scrollWidth - b.width) -
            Math.max(a.right - window.innerWidth, -a.left, a.scrollWidth - a.width)
        )
        .slice(0, 20)
    );
    await page.screenshot({
      path: path.join(outputDir, `${name}-overflow.png`),
      fullPage: true,
    });
    throw new Error(
      `${name}: overflow horizontal (${overflow.scrollWidth}px > ${overflow.width}px); offenders=${JSON.stringify(offenders)}`
    );
  }
"""
if needle not in source:
    raise SystemExit('Visual overflow block not found')
path.write_text(source.replace(needle, replacement, 1))
