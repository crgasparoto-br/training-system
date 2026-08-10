import { BrowserContext } from 'puppeteer';

const originalNewPage = BrowserContext.prototype.newPage;

BrowserContext.prototype.newPage = async function issue275NewPage(...args) {
  const page = await originalNewPage.apply(this, args);

  await page.evaluateOnNewDocument(() => {
    const fillGender = () => {
      const gender = document.querySelector('#pre-registration-gender');
      if (!(gender instanceof HTMLSelectElement) || gender.value) return;

      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value'
      )?.set;
      setter?.call(gender, 'male');
      gender.dispatchEvent(new Event('input', { bubbles: true }));
      gender.dispatchEvent(new Event('change', { bubbles: true }));
      gender.dispatchEvent(new Event('blur', { bubbles: true }));
    };

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        const button = target instanceof Element ? target.closest('button') : null;
        if (!button?.textContent?.includes('Salvar e avançar')) return;
        fillGender();
      },
      true
    );
  });

  return page;
};
