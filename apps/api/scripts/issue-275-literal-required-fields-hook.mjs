import { BrowserContext } from 'puppeteer';

const originalNewPage = BrowserContext.prototype.newPage;

BrowserContext.prototype.newPage = async function issue275NewPage(...args) {
  const page = await originalNewPage.apply(this, args);

  await page.evaluateOnNewDocument(() => {
    const setRequiredSelects = () => {
      const gender = document.querySelector('#pre-registration-gender');
      if (!(gender instanceof HTMLSelectElement) || gender.value) return;

      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value'
      )?.set;
      setter?.call(gender, 'male');
      gender.dispatchEvent(new Event('input', { bubbles: true }));
      gender.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.addEventListener('DOMContentLoaded', () => {
      setRequiredSelects();
      const root = document.body || document.documentElement;
      if (!root) return;
      new MutationObserver(setRequiredSelects).observe(root, {
        childList: true,
        subtree: true,
      });
    });
  });

  return page;
};
