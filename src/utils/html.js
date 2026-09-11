/**
 * Escapes a value for interpolation into an HTML string.
 *
 * SweetAlert's `html:` option renders its argument as markup. The failure popups build that
 * markup out of uploaded filenames and server messages, so a file named
 * `<img src=x onerror=...>.csv` executed script in the uploader's browser.
 *
 * Uses the DOM's own escaping rather than a hand-written replace table - the browser already
 * knows every character that needs it.
 */
export const escapeHtml = (value) => {
  const div = document.createElement('div');
  div.textContent = value === null || value === undefined ? '' : String(value);
  return div.innerHTML;
};
