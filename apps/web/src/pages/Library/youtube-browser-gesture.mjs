// Send a trusted browser gesture to the visible cross-origin iframe. Do not
// depend on a private YouTube CSS class or dispatch synthetic DOM events.
export async function clickNativePlayer(page, iframe) {
  const target = await page.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, exposed: rect.width > 0 && rect.height > 0 && hit === node };
  }, iframe);
  if (!target.exposed) throw new Error('Native player iframe center is not visible or is obstructed');
  await page.mouse.click(target.x, target.y);
  return { method: 'native-iframe-center', x: target.x, y: target.y };
}
