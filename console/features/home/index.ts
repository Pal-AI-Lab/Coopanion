/**
 * 「开始」: the app's home page. Everything the first minutes need on one page, top to bottom in
 * the order it is needed: the model service and its key, then the pet, then the console's color
 * scheme (appearance.ts, what Cortico's settings page held). The model card is one view:
 * the service in use on the first row (with 「测试连接」), every other one on the second (in the order
 * for the console's language; outside Chinese the services that take mainland China accounts only
 * behind a More button); the picked one's model and key boxes are below, and 「保存并开始」 saves the
 * key to that service's own endpoint on the platform for the language unless switched, tests it,
 * makes the endpoint active and resumes the run. The link to other model services asks, in the
 * normal mode, before it switches to the advanced mode, where the model pages are. 「我的桌宠」 says
 * whether the pet is on the desktop, shows it live (the pet page in a tab, which draws its own wall,
 * floor and night/day button), and under it hides it, shows it and opens the dressing page. Voice
 * input and computer use have their own pages (features/voice, features/cua); 「使用引导」 at the top
 * has Coo run its introduction again on the desktop (the app's Core holds it; this window steps aside
 * for it). Saving and testing the key lives in model.ts. Every control calls an endpoint the rest of
 * the console already uses. Styles are in home.css, which scripts/stage.ts adds to the console stylesheet.
 */
import { post } from '../../core/api.ts';
import { LANGUAGE } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { intro } from '../intro.ts';
import { mountSchemes } from './appearance.ts';
import { readMode, requestMode } from '../mode.ts';
import {
  connectVendor, consoleCall, defaultRegion, localized, locate, readStatus, regionsOf, siteOf, testEndpoint, VENDOR_ICONS, vendorName, vendorsFor,
  type ConnectResult, type Region, type Status, type Vendor,
} from './model.ts';
import { S } from './strings.ts';

const PET_PAGE = 'world:desktop-pet';

interface PetState { connected: boolean; onDesktop?: boolean; url: string | null }

/**
 * The preview's height: what is left down to the window's bottom edge (less a small margin) as the page
 * first opens, so the model card and the preview fill the window; it follows the window's height between
 * these bounds.
 */
const PREVIEW_MIN = 220;
const PREVIEW_MAX = 560;
const PREVIEW_GAP = 20;

const panelPath = (page: string, panel: string, method: string) => `/api/console/providers/${encodeURIComponent(page)}/panels/${panel}/${method}`;
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- heading ---------- */
  const guide = ui.button(S.guide, { size: 'sm', onClick: () => { void post(panelPath(PET_PAGE, 'pet', 'guide'), { args: [] }, opts).catch((err) => ui.toast(String(err instanceof Error ? err.message : err))); } });
  guide.title = S.guideHint;
  root.append(intro(ui, S.nav, { actions: [guide] }));

  /* ---------- model ---------- */
  // one view: the service in use on the first row with its test button, the others below it; a pick fills
  // the model and key boxes under them, saved with 「保存并开始」
  const model = ui.sheet({ title: S.modelTitle });
  const modelMsg = ui.msgline('');
  const call = consoleCall(signal);
  const { shown, more } = vendorsFor(LANGUAGE);
  const listed = [...shown, ...more];
  /** The service the key box is for: picked on the rows of logos. */
  let vendor: Vendor = shown[0]!;
  /** Which of the service's platforms, for a service with one per region. */
  let region: Region = defaultRegion(LANGUAGE);
  const vendorButton = (mark: string, name: string) => {
    const b = ui.h('button', 'home-vendor');
    b.type = 'button';
    const m = ui.h('span', 'home-vendormark');
    // the marks are the provider package's own static SVGs
    m.innerHTML = mark;
    b.append(m, ui.h('span', null, name));
    return b;
  };
  const vendorButtons = listed.map((v) => {
    const b = vendorButton(VENDOR_ICONS[v.id] ?? '', vendorName(v, LANGUAGE));
    b.addEventListener('click', () => pickVendor(v), opts);
    return b;
  });
  const moreButton = ui.h('button', 'home-vendor home-more', S.more);
  moreButton.type = 'button';
  let unfolded = !more.length;
  moreButton.addEventListener('click', () => { unfolded = true; placeVendors(); }, opts);
  /** The first row: the service in use (a button that picks it) or a line saying none is, and the test. */
  const currentBox = ui.h('div', 'home-vendors');
  const test = ui.button(S.test, { size: 'sm' });
  /** The second row: every other service, the ones behind 「更多」 once unfolded. */
  const otherBox = ui.h('div', 'home-vendors');
  const picker = ui.h('div', 'home-picker');
  picker.append(ui.h('span', 'home-pickerlabel', S.connectedLabel), currentBox, ui.h('span', 'home-pickerlabel', S.choicesLabel), otherBox);
  const keyInput = ui.input({});
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  // any model name the service takes; the service's own suggestions drop down as it is typed
  const modelInput = ui.input({});
  modelInput.autocomplete = 'off';
  modelInput.spellcheck = false;
  const modelList = ui.h('datalist');
  modelList.id = 'home-model-list';
  modelInput.setAttribute('list', modelList.id);
  const keyRow = ui.rowbar();
  keyRow.classList.add('home-keyrow');
  const save = ui.button(S.saveStart, { variant: 'primary' });
  const keyField = ui.field(S.keyLabel(vendorName(vendor, LANGUAGE)), keyInput);
  const modelField = ui.field(S.modelLabel, modelInput);
  modelField.classList.add('home-modelfield');
  keyRow.append(modelField, keyField, modelList, save);
  /** The active endpoint's service, platform and model, once the status is read. */
  let active: { vendor: Vendor | null; region: Region | null; model: string } = { vendor: null, region: null, model: '' };
  /** The active endpoint when it is none of the listed services (set up by hand on the Model page). */
  let elsewhere: { title: string; model: string } | null = null;
  /** The key box is for the endpoint in use, whose saved key an empty box keeps. */
  const inUse = () => active.vendor === vendor && (active.region ?? region) === region;
  const getKey = ui.h('a', 'home-link', '');
  getKey.target = '_blank'; getKey.rel = 'noopener';
  const regionLink = ui.h('a', 'home-link', '');
  regionLink.href = '#';
  regionLink.addEventListener('click', (e) => {
    e.preventDefault();
    pickVendor(vendor, region === 'cn' ? 'intl' : 'cn');
  }, opts);
  /** Puts the service in use on the first row and the rest on the second; the picked one is lit. */
  const placeVendors = () => {
    const current = active.vendor;
    const label = (v: Vendor) => (v === current && active.model ? `${vendorName(v, LANGUAGE)} · ${active.model}` : vendorName(v, LANGUAGE));
    vendorButtons.forEach((b, i) => {
      const v = listed[i]!;
      const name = b.lastElementChild;
      if (name) name.textContent = label(v);
      b.classList.toggle('on', v === vendor);
    });
    if (current) currentBox.replaceChildren(vendorButtons[listed.indexOf(current)]!, test);
    else if (elsewhere) {
      const b = vendorButton('', elsewhere.model ? `${elsewhere.title} · ${elsewhere.model}` : elsewhere.title);
      b.classList.add('on');
      b.disabled = true;
      currentBox.replaceChildren(b, test);
    } else currentBox.replaceChildren(ui.h('span', 'home-none', S.notConnected));
    const rest = listed.filter((v) => v !== current && (unfolded || !more.includes(v) || v === vendor));
    otherBox.replaceChildren(...rest.map((v) => vendorButtons[listed.indexOf(v)]!), ...(unfolded ? [] : [moreButton]));
  };
  /** The service in use starts on its own platform, another one on the platform for the language. */
  const pickVendor = (v: Vendor, r?: Region) => {
    vendor = v;
    region = r ?? (active.vendor === v ? active.region : null) ?? defaultRegion(LANGUAGE);
    placeVendors();
    keyInput.placeholder = inUse() ? S.keepKey : localized(v.keyHint, LANGUAGE);
    modelInput.value = inUse() && active.model ? active.model : v.model;
    modelList.replaceChildren(...[v.model, ...(v.models ?? [])].map((m) => Object.assign(document.createElement('option'), { value: m })));
    const label = keyField.querySelector('.fieldlabel');
    if (label) label.textContent = S.keyLabel(vendorName(v, LANGUAGE));
    getKey.textContent = S.getKey(vendorName(v, LANGUAGE));
    getKey.href = siteOf(v, region).keyUrl;
    regionLink.hidden = !regionsOf(v).length;
    regionLink.textContent = region === 'cn' ? S.toIntl : S.toCn;
  };
  pickVendor(vendor);
  const need = ui.h('p', 'home-note', S.modelNeed(vendorName(shown[0]!, LANGUAGE)));
  // in the normal mode it asks before switching to the advanced mode, where the Model page is
  const otherLink = ui.h('a', 'home-link', S.otherProvider);
  otherLink.href = '#/providers';
  otherLink.addEventListener('click', async (e) => {
    if (readMode() === 'advanced') return;
    e.preventDefault();
    if (!await ui.confirm({ title: S.toAdvancedTitle, body: S.toAdvancedBody })) return;
    requestMode('advanced');
    ctx.router.navigate(['providers']);
  }, opts);
  const links = ui.rowbar();
  links.classList.add('home-links');
  links.append(getKey, regionLink, ui.h('span', 'grow'), otherLink);
  model.body.append(need, picker, keyRow, links, modelMsg);
  root.append(model.el);

  /* ---------- pet ---------- */
  // whether the pet is on the desktop beside the title; the preview reaches the window's bottom edge as the
  // page first opens and shrinks with a shorter window; the buttons under it
  const pet = ui.sheet({ title: S.petTitle });
  const petPill = ui.pill('—', 'off');
  pet.el.querySelector(':scope > h3')?.append(petPill);
  const preview = ui.h('iframe', 'home-petframe');
  preview.title = S.petTitle;
  const petLine = ui.rowbar();
  petLine.classList.add('home-petactions');
  const hidePet = ui.button(S.hidePet, { size: 'sm' });
  const showPet = ui.button(S.showPet, { size: 'sm' });
  const dress = ui.button(S.dress, { size: 'sm', variant: 'primary' });
  petLine.append(ui.h('span', 'grow'), hidePet, showPet, dress);
  pet.body.append(preview, petLine);
  root.append(pet.el);
  const fitPreview = () => {
    const top = preview.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    preview.style.setProperty('--fit', `${Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, root.clientHeight - top - PREVIEW_GAP))}px`);
  };
  const fit = new ResizeObserver(fitPreview);
  fit.observe(root);
  fit.observe(model.el);
  ctx.lifecycle.add(() => fit.disconnect());

  /* ---------- behaviour ---------- */
  let status: Status | null = null;
  let vendorShown = false;

  const renderStatus = (st: Status) => {
    status = st;
    const mc = st.modelConnection;
    const ready = !!mc?.ready;
    need.hidden = ready;
    test.disabled = !ready;
    const at = ready ? locate(mc?.baseUrl) : null;
    const current = at?.vendor ?? null;
    active = { vendor: current, region: at?.region ?? null, model: mc?.model ?? '' };
    elsewhere = ready && !current && mc ? { title: mc.moduleTitle, model: mc.model ?? '' } : null;
    // the boxes start on the service in use, once
    if (!vendorShown && current) { vendorShown = true; pickVendor(current); }
    else placeVendors();
  };

  const refreshModel = async () => {
    renderStatus(await readStatus(signal));
  };

  const showTest = (r: ConnectResult) => {
    modelMsg.textContent = r.ok ? S.testOk(r.ms) : S.testFail(r.why ?? '');
    modelMsg.classList.toggle('bad', !r.ok);
  };
  const testing = () => {
    modelMsg.textContent = S.testing;
    modelMsg.classList.remove('bad');
  };

  save.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    // only the endpoint in use has a key saved to keep
    if (!key && !inUse()) { keyInput.focus(); return; }
    save.disabled = true;
    try {
      testing();
      const r = await connectVendor(call, vendor, key, modelInput.value, region);
      keyInput.value = '';
      showTest(r);
      if (r.ok) modelMsg.textContent = S.started;
      await refreshModel();
    } catch (err) {
      modelMsg.textContent = errText(err);
      modelMsg.classList.add('bad');
    } finally {
      save.disabled = false;
    }
  });
  test.addEventListener('click', async () => {
    const name = status?.modelConnection?.name;
    if (!name) return;
    testing();
    showTest(await testEndpoint(call, name));
  });

  /* pet */
  let petState: PetState | null = null;
  const refreshPet = async () => {
    try {
      petState = await post<PetState>(panelPath(PET_PAGE, 'pet', 'state'), { args: [] }, opts);
    } catch { petState = null; }
    const onDesktop = petState?.onDesktop === true;
    petPill.textContent = onDesktop ? S.petShown : S.petHidden;
    petPill.className = `pill ${onDesktop ? 'on' : 'off'}`;
    hidePet.disabled = !onDesktop;
    if (petState?.url && preview.dataset.src !== petState.url) {
      preview.dataset.src = petState.url;
      preview.src = petState.url;
    }
  };
  const petCall = (method: string) => post(panelPath(PET_PAGE, 'pet', method), { args: [] }, opts).catch(() => null);
  showPet.addEventListener('click', async () => {
    // a hidden window comes back by opening it again
    await petCall('closeWindow');
    await petCall('openWindow');
    setTimeout(() => void refreshPet(), 1500);
  });
  hidePet.addEventListener('click', async () => {
    await petCall('hideWindow');
    setTimeout(() => void refreshPet(), 400);
  });
  dress.addEventListener('click', () => ctx.router.navigate(['dress']));

  /* ---------- color scheme ---------- */
  root.append(mountSchemes(ctx));

  await Promise.all([refreshModel(), refreshPet()]);
  ctx.lifecycle.interval(() => { void refreshModel(); void refreshPet(); }, 2000);
}

export const homeFeature: FrameworkFeature = {
  route: 'home',
  label: S.nav,
  icon: 'play',
  navMode: 'primary',
  mount,
};
