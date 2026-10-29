import { useLanguage, t } from './i18n.js';
import { renderConfirmation } from './confirm-view.js';

const host = window.confirmHost;
if (host) {
  const request = await host.state();
  if (request) {
    await useLanguage(request.language);
    renderConfirmation(document, request, index => host.answer(index), t('bubble.close'));
  }
}
