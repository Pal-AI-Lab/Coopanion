/** Renders one trusted application's request as text; only an explicit choice answers it. */
export function renderConfirmation(document, request, answer, closeLabel) {
  document.title = request.caption;
  if (request.theme === 'dark' || request.theme === 'light') document.documentElement.dataset.theme = request.theme;
  document.querySelector('#caption').textContent = request.caption;
  document.querySelector('#question').textContent = request.question;
  const choices = document.querySelector('#choices');
  let done = false;
  const finish = (index) => {
    if (done) return;
    done = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    answer(index);
  };
  request.options.forEach((label, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.className = `choice${index === 0 ? ' allow' : ''}`;
    button.addEventListener('click', () => finish(index));
    // Refuse is first in keyboard order; approval requires moving focus or clicking it.
    if (index === request.options.length - 1) choices.prepend(button);
    else choices.append(button);
  });
  const close = document.querySelector('#close');
  close.setAttribute('aria-label', closeLabel);
  close.addEventListener('click', () => finish(null));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); finish(null); } });
  choices.firstElementChild.focus();
}
