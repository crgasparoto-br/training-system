from pathlib import Path

path = Path('apps/api/scripts/visual-audit-issue-270.mjs')
source = path.read_text()
start = source.index("  const overflow = await page.evaluate(() => ({")
end = source.index("  if (consoleErrors.length) {", start)
replacement = """  const overflow = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const offenders = Array.from(document.querySelectorAll('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: style.display,
          visibility: style.visibility,
          text: (element.textContent || '').trim().slice(0, 100),
        };
      })
      .filter(
        (item) =>
          item.display !== 'none' &&
          item.visibility !== 'hidden' &&
          item.width > 0 &&
          item.height > 0 &&
          item.right > 0 &&
          item.left < viewportWidth &&
          (item.right > viewportWidth + 1 || item.left < -1)
      )
      .sort(
        (a, b) =>
          Math.max(b.right - viewportWidth, -b.left) -
          Math.max(a.right - viewportWidth, -a.left)
      )
      .slice(0, 20);
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });
  if (overflow.offenders.length > 0) {
    await page.screenshot({
      path: path.join(outputDir, `${name}-overflow.png`),
      fullPage: true,
    });
    throw new Error(
      `${name}: elementos visíveis ultrapassam a viewport; offenders=${JSON.stringify(overflow.offenders)}`
    );
  }
  if (overflow.scrollWidth > overflow.width + 1) {
    console.log(
      `${name}: largura intrínseca contida (${overflow.scrollWidth}px > ${overflow.width}px), sem elemento visível fora da viewport`
    );
  }
"""
path.write_text(source[:start] + replacement + source[end:])
