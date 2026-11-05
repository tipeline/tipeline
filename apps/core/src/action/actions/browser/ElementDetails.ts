import { ElementHandle } from 'puppeteer-core';

// type ElementDetailsType = {
//   tag: string;
//   id: string | null;
//   class: string | null;
//   name: string | null;
//   title: string | null;
//   text: string | null;
//   innerText: string | null;
//   innerHTML: string | null;
//   outerHTML: string | null;
//   value: string | null;
//   href: string | null;
//   src: string | null;
//   alt: string | null;
//   type: string | null;
//   checked: boolean | null;
//   disabled: boolean | null;
//   readonly: boolean | null;
//   visible: boolean;
//   color: string | null;
//   rect: DOMRect;
// };

export class ElementDetails {
  static async getAttributeValue(
    element: ElementHandle | null,
    attribute: string
  ): Promise<string | boolean> {
    if (!element) {
      if (attribute === 'exists') return false;
      return '';
    }

    return await element.evaluate((el, attr) => {
      switch (attr) {
        case 'text':
          return el.textContent?.trim() || '';
        case 'id':
        case 'class':
        case 'title':
        case 'href':
          return el.getAttribute(attr) || '';
        case 'src':
          return (el as HTMLImageElement).src || '';
        case 'enabled':
          return !(el as HTMLInputElement | HTMLButtonElement).disabled ? 'true' : 'false';
        case 'visible': {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 ? 'true' : 'false';
        }
        case 'ordinal': {
          const parent = el.parentElement;
          if (!parent) return '';
          return Array.from(parent.children).indexOf(el).toString();
        }
        case 'innerHTML':
          return (el as HTMLElement).innerHTML || '';
        case 'innerText':
          return (el as HTMLElement).innerText || '';
        default:
          return el.getAttribute(attr) || '';
      }

      // const computed = window.getComputedStyle(el);
      // const rect = el.getBoundingClientRect();
      // return {
      //   tag: el.tagName,
      //   id: el.getAttribute('id'),
      //   class: el.getAttribute('class'),
      //   name: el.getAttribute('name'),
      //   title: el.getAttribute('title'),
      //   text: el.textContent,
      //   innerText: (el as HTMLElement).innerText || null,
      //   innerHTML: (el as HTMLElement).innerHTML || null,
      //   outerHTML: (el as HTMLElement).outerHTML || null,
      //   value: (el as HTMLInputElement).value || null,
      //   href: (el as HTMLAnchorElement).href || null,
      //   src: (el as HTMLImageElement).src || null,
      //   alt: (el as HTMLImageElement).alt || null,
      //   type: (el as HTMLInputElement).type || null,
      //   checked: (el as HTMLInputElement).checked ?? null,
      //   disabled: (el as HTMLInputElement).disabled ?? null,
      //   readonly: (el as HTMLInputElement).readOnly ?? null,
      //   visible:
      //     !!(rect.width && rect.height) &&
      //     computed.visibility !== 'hidden' &&
      //     computed.display !== 'none',
      //   color: computed.color,
      //   rect,
      // };
    }, attribute);
  }
}
