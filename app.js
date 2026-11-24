import { isImage, parseQuestions, readImport, storedGet, storedPut } from './bank.js';

const dom = id => document.getElementById(id);
function element(tag, value, className) {
  const item = document.createElement(tag);
  if (value != null) item.textContent = value;
  if (className) item.className = className;
  return item;
}
function button(label, run, className = 'quiet') {
  const item = element('button', label, className);
  item.type = 'button';
  item.addEventListener('click', run);
  return item;
}
const number = n => n.toLocaleString('en-US');
const pct = (hits, total) => total ? Math.round(hits / total * 100) + '%' : '—';
const keys = ['A','B','C','D'];
const domains = [
  [50, 'Engagement Planning', 'engagement_planning'],
  [40, 'Information Gathering, Analysis, and Evaluation', 'information_gathering_analysis_and_evaluation'],
  [10, 'Engagement Supervision and Communication', 'engagement_supervision_and_communication'],
];
const allocations = [63, 50, 12];
const metricNames = ['Questions in bank', 'Questions seen', 'Accuracy'];
const stateKey = 'cia2-desk-progress-v1';
let history = {};
let session = null;
let bank = [];
let questionsById = new Map();
let groups = new Map();
let picked = new Set();
const imageURLs = new Map();
let menu = {units:[]};
let playlist = [];
let episodeIndex = 0;
const audio = dom('audio');
let timer;

function localRead(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function localWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function save() { localWrite(stateKey, {history, session}); }
const stored = localRead(stateKey, {});
history = stored.history ?? {};
session = stored.session ?? null;
const topic = q => q.unit_number + '.' + q.subunit_number;

function setBank(rows) {
  bank = rows;
  questionsById = new Map(rows.map(q => [q.id, q]));
  groups = new Map();
  for (const q of rows) {
    if (!groups.has(q.unit_number)) groups.set(q.unit_number, {title:q.unit_title, topics:new Map(), count:0});
    const group = groups.get(q.unit_number);
    const id = topic(q);
    if (!group.topics.has(id)) group.topics.set(id, {title:q.subunit_title, count:0});
    group.topics.get(id).count++;
    group.count++;
  }
  picked = new Set([...groups.values()].flatMap(g => [...g.topics.keys()]));
  if (session && !session.ids.every(id => questionsById.has(id))) session = null;
  renderTopics();
  refresh();
}
function show(page) {
  for (const name of ['study','listen','progress','data']) dom(name).hidden = name !== page;
  for (const item of document.querySelectorAll('[data-page]')) {
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  if (page === 'progress') renderProgress();
  window.scrollTo(0, 0);
  dom('main').focus({preventScroll:true});
}
function renderTopics() {
  const root = dom('topics');
  root.replaceChildren();
  for (const [unit, group] of groups) {
    const section = element('details');
    section.append(element('summary', unit + '. ' + group.title + ' · ' + group.count));
    for (const [id, item] of group.topics) {
      const row = element('label', null, 'topic-row subtopic');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = picked.has(id);
      input.dataset.topic = id;
      input.addEventListener('change', () => {
        if (input.checked) picked.add(id); else picked.delete(id);
        refresh();
      });
      row.append(input, element('span', id + ' ' + item.title + ' · ' + item.count));
      section.append(row);
    }
    root.append(section);
  }
}
const mode = () => dom('session-form').elements.mode.value;
const missed = () => bank.filter(q => Object.hasOwn(history, q.id) && history[q.id].last === false);
const practicePool = () => bank.filter(q => picked.has(topic(q)));
function recorded() { return bank.flatMap(q => Object.hasOwn(history, q.id) ? [history[q.id]] : []); }
function analytics(rows) { return rows.reduce((a, row) => [a[0] + row.right, a[1] + row.tries], [0,0]); }
function refresh() {
  const stats = recorded();
  const [hits, attempts] = analytics(stats);
  dom('summary').replaceChildren(...[number(bank.length), number(stats.length), pct(hits, attempts)].map((value, i) => {
    const metric = element('div', null, 'metric');
    metric.append(element('strong', value), element('small', metricNames[i]));
    return metric;
  }));
  const current = mode();
  const practice = practicePool();
  const count = current === 'missed' ? missed().length : practice.length;
  dom('topic-count').textContent = '· ' + number(practice.length);
  dom('topic-picker').hidden = current !== 'practice' || !bank.length;
  dom('session-settings').hidden = current === 'exam';
  dom('exam-note').hidden = current !== 'exam';
  const examReady = domains.every(([, , key], i) => bank.filter(q => q.exam_domain_key === key).length >= allocations[i]);
  dom('setup-note').textContent = !bank.length ? 'Import the question bank to start studying.' :
    current === 'exam' ? (examReady ? '' : 'The bank needs enough questions in all three exam domains.') :
    count ? number(count) + ' questions available' : 'No questions available for this session.';
  const start = dom('start');
  start.textContent = !bank.length ? 'Import question bank' : ({practice:'Start practice', exam:'Start exam simulation', missed:'Review missed questions'})[current];
  start.disabled = Boolean(bank.length && (current === 'exam' ? !examReady : !count));
  const resume = dom('resume-session');
  resume.replaceChildren();
  if (session && bank.length) resume.append(button('Resume saved session', resumeQuiz, 'primary'));
}
function shuffled(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function start(e) {
  e.preventDefault();
  if (!bank.length) return show('data');
  if (session && !window.confirm('Replace your saved session with a new one?')) return;
  const type = mode();
  const size = Number(dom('amount').value);
  const items = type === 'exam' ? shuffled(domains.flatMap(([, ,key], i) => shuffled(bank.filter(q => q.exam_domain_key === key)).slice(0, allocations[i]))) :
    shuffled(type === 'practice' ? practicePool() : missed()).slice(0, size);
  if (!items.length) return;
  const minutes = type === 'exam' ? 150 : dom('timing').value === '1' ? items.length * 1.2 : 0;
  session = {type, ids:items.map(q => q.id), index:0, answers:Array(items.length).fill(null), ends:minutes ? Date.now() + minutes * 60000 : 0};
  save();
  resumeQuiz();
}
function resumeQuiz() {
  if (!session) return;
  clearInterval(timer);
  dom('setup').hidden = true;
  dom('results').hidden = true;
  dom('quiz').hidden = false;
  renderQuestion();
  tick();
  if (session?.ends) timer = setInterval(tick, 500);
}
function tick() {
  if (!session?.ends) return;
  const seconds = Math.max(0, Math.ceil((session.ends - Date.now()) / 1000));
  if (!seconds) { finish('Time is up.'); return; }
  const clock = dom('clock');
  if (clock) clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0');
}
function record(q, answer) {
  const current = Object.hasOwn(history, q.id) ? history[q.id] : {right:0, tries:0};
  const right = answer === q.correct_answer;
  Object.defineProperty(history, q.id, {value:{right:current.right + Number(right), tries:current.tries + 1, last:right}, enumerable:true, writable:true, configurable:true});
}
function answer(letter) {
  const current = session;
  if (!current || (current.type !== 'exam' && current.answers[current.index])) return;
  if (current.ends && current.ends <= Date.now()) return finish('Time is up.');
  current.answers[current.index] = letter;
  if (current.type !== 'exam') record(questionsById.get(current.ids[current.index]), letter);
  save();
  renderQuestion();
  if (current.type === 'exam') dom('choice-' + letter)?.focus();
  else dom('feedback')?.focus();
}
async function attachImage(parent, name, alt, zoom = false) {
  let url = imageURLs.get(name);
  if (!url) {
    const blob = await storedGet(name).catch(() => null);
    if (blob instanceof Blob) {
      url = URL.createObjectURL(blob);
      imageURLs.set(name, url);
    }
  }
  if (!parent.isConnected) return;
  if (!url) {
    parent.append(element('span', 'Image unavailable. Import the ZIP to add it.', 'muted'));
    return;
  }
  const img = element('img', null, 'figure');
  img.src = url;
  img.alt = alt;
  if (zoom) {
    const a = element('a', null, 'zoom');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.append(img);
    parent.append(a);
  } else parent.append(img);
}
function renderQuestion() {
  const {index, ids, type, answers} = session;
  const q = questionsById.get(ids[index]);
  const selected = answers[index];
  const reveal = type !== 'exam' && selected !== null;
  const root = dom('quiz');
  const card = element('div', null, 'card');
  const top = element('div', null, 'session-top');
  const clock = element('strong', null);
  clock.id = 'clock';
  clock.setAttribute('aria-label','Time remaining');
  top.append(element('strong', 'Question ' + (index + 1) + ' / ' + ids.length), clock);
  const bar = element('progress', null, 'bar');
  bar.max = ids.length;
  bar.value = index + 1;
  bar.setAttribute('aria-label', 'Session position');
  const title = element('h2', q.question, 'prompt');
  title.tabIndex = -1;
  title.id = 'question-title';
  card.append(top, bar, element('p', 'Unit ' + q.unit_number + ' · ' + q.subunit_title, 'muted'));
  if (q.context) card.append(element('div', q.context, 'context'));
  card.append(title);
  const attached = new Set(Object.values(q.options).filter(isImage));
  const pictures = element('div');
  card.append(pictures);
  const choices = element('div', null, 'choices');
  for (const letter of keys) {
    const value = q.options[letter];
    const option = button(null, () => answer(letter), 'option');
    option.id = 'choice-' + letter;
    const content = element('span', isImage(value) ? '' : value);
    option.append(element('strong', letter), content);
    if (!reveal) option.setAttribute('aria-pressed', String(letter === selected));
    else option.disabled = true;
    if (letter === selected) option.classList.add('chosen');
    if (reveal && letter === q.correct_answer) option.classList.add('correct');
    if (reveal && letter === selected && selected !== q.correct_answer) option.classList.add('wrong');
    choices.append(option);
    if (isImage(value)) queueMicrotask(() => { void attachImage(content, value, 'Image choice ' + letter); });
  }
  card.append(choices);
  if (reveal) {
    const good = selected === q.correct_answer;
    const feedback = element('div', good ? 'Correct' : 'Correct answer: ' + q.correct_answer, 'feedback ' + (good ? 'good' : 'bad'));
    feedback.id = 'feedback';
    feedback.tabIndex = -1;
    feedback.setAttribute('role','status');
    card.append(feedback);
  }
  const actions = element('div', null, 'quiz-nav');
  actions.append(button('Save and exit', pause), button('Finish', () => requestFinish()));
  const previous = button('Back', () => move(-1));
  previous.disabled = index === 0;
  actions.append(previous);
  const next = button(index + 1 === ids.length ? 'See results' : 'Next question', () => {
    if (index + 1 === ids.length) requestFinish(); else move(1);
  }, 'primary');
  next.disabled = type !== 'exam' && !selected;
  actions.append(next);
  card.append(actions);
  root.replaceChildren(card);
  const illustrations = new Set([...(q.images ?? []), ...(isImage(q.image) ? [q.image] : [])]);
  for (const name of illustrations) if (!attached.has(name)) void attachImage(pictures, name, 'Question exhibit', true);
  if (session?.ends) tick();
}
function move(amount) {
  session.index += amount;
  save();
  renderQuestion();
  window.scrollTo(0, 0);
  dom('question-title')?.focus({preventScroll:true});
}
function pause() {
  clearInterval(timer);
  dom('quiz').hidden = true;
  dom('setup').hidden = false;
  refresh();
  window.scrollTo(0, 0);
}
function requestFinish() {
  if (session.answers.includes(null) && !window.confirm('Finish with unanswered questions?')) return;
  finish();
}
function finish(note = '') {
  if (!session) return;
  clearInterval(timer);
  const completed = session;
  session = null;
  const evaluated = completed.ids.map((id, i) => [questionsById.get(id), completed.answers[i]]);
  if (completed.type === 'exam') for (const [q, a] of evaluated) record(q, a);
  save();
  const right = evaluated.filter(([q,a]) => q.correct_answer === a).length;
  const total = completed.type === 'exam' ? evaluated.length : evaluated.filter(([,a]) => a).length;
  const card = element('div', null, 'card');
  card.append(element('h2', 'Session results'), element('p', right + ' / ' + total + ' correct', 'score'));
  if (note) card.append(element('p', note, 'muted'));
  if (completed.type === 'exam') card.append(element('p', 'Practice score · ' + pct(right,total), 'muted'));
  const review = element('details');
  review.append(element('summary','Review incorrect and unanswered'));
  for (const [q, a] of evaluated.filter(([q,a]) => q.correct_answer !== a)) {
    const item = element('div');
    item.append(element('p',q.question),element('p','Your answer: ' + (a ?? 'Unanswered') + ' · Correct: ' + q.correct_answer,'muted'));
    const value = q.options[q.correct_answer];
    if (isImage(value)) queueMicrotask(() => { void attachImage(item, value, 'Correct image answer', true); });
    else item.append(element('p',value));
    review.append(item, element('hr'));
  }
  if (review.childElementCount === 1) review.append(element('p','No items to review.'));
  card.append(review, button('New session', () => {
    dom('results').hidden = true; dom('setup').hidden = false; refresh();
  },'primary'));
  dom('quiz').hidden = true;
  dom('results').replaceChildren(card);
  dom('results').hidden = false;
  refresh();
  window.scrollTo(0, 0);
}
function renderProgress() {
  const root = dom('progress-content');
  root.replaceChildren(element('h2','Coverage by unit'));
  if (!bank.length) root.append(element('p','Import a question bank to see your progress.', 'muted'),button('Open question bank',()=>show('data')));
  for (const [unit, group] of groups) {
    const viewed = bank.filter(q => q.unit_number === unit && Object.hasOwn(history,q.id));
    const [hits, attempts] = analytics(viewed.map(q => history[q.id]));
    const row = element('div',null,'ledger-row');
    row.append(element('span',unit + '. ' + group.title), element('span',viewed.length + '/' + group.count + ' · ' + pct(hits,attempts)));
    root.append(row);
  }
}

function renderEpisodes() {
  const selected = menu.units.find(u => String(u.unit) === dom('podcast-unit').value);
  const container = dom('episodes');
  container.replaceChildren();
  if (!selected) { container.append(element('p','Podcast list unavailable. Reload to try again.','muted')); return; }
  if (selected.tracks.some(t => t.ready)) container.append(button('Play available episodes', () => loadTrack(selected.tracks.filter(t=>t.ready),0)));
  for (const track of selected.tracks) {
    const row = element('div',null,'episode');
    const title = element('span');
    title.append(element('strong',track.title),element('small',track.ready ? 'Available' : 'Coming soon'));
    row.append(title);
    if (track.ready) row.append(button('Play',()=>loadTrack(selected.tracks.filter(t=>t.ready),selected.tracks.filter(t=>t.ready).indexOf(track))));
    container.append(row);
  }
}
function loadTrack(tracks, index) {
  if (!tracks[index]) return;
  playlist = tracks;
  episodeIndex = index;
  const item = tracks[index];
  dom('now-playing').hidden = false;
  dom('track-title').textContent = item.title;
  dom('audio-status').textContent = '';
  dom('next-track').disabled = index + 1 >= tracks.length;
  const currentSource = new URL(item.file, location.href).href;
  audio.src = currentSource;
  audio.playbackRate = Number(dom('speed').value);
  audio.play().catch(() => { dom('audio-status').textContent = 'Tap play to start audio.'; });
}
function saveAudio() {
  const item = playlist[episodeIndex];
  if (item && Number.isFinite(audio.currentTime)) localWrite('cia2-audio:' + item.file, audio.currentTime);
}
audio.addEventListener('loadedmetadata', () => {
  const item = playlist[episodeIndex];
  if (!item) return;
  const time = localRead('cia2-audio:' + item.file, 0);
  if (time > 0 && time < audio.duration - 3) audio.currentTime = time;
});
audio.addEventListener('timeupdate', saveAudio);
audio.addEventListener('pause', saveAudio);
audio.addEventListener('error', () => { dom('audio-status').textContent = 'This recording could not be loaded.'; });
audio.addEventListener('ended', () => {
  if (dom('autoplay').checked) loadTrack(playlist, episodeIndex + 1);
});
dom('next-track').addEventListener('click', () => loadTrack(playlist, episodeIndex + 1));
dom('speed').addEventListener('change', e => { audio.playbackRate = Number(e.target.value); });
dom('podcast-unit').addEventListener('change',renderEpisodes);
dom('session-form').addEventListener('submit',start);
dom('session-form').addEventListener('change',refresh);
for (const nav of document.querySelectorAll('[data-page]')) nav.addEventListener('click',()=>show(nav.dataset.page));
for (const control of document.querySelectorAll('[data-topics]')) control.addEventListener('click', () => {
  const all = control.dataset.topics === 'all';
  picked = new Set();
  for (const input of document.querySelectorAll('[data-topic]')) {
    input.checked = all;
    if (all) picked.add(input.dataset.topic);
  }
  refresh();
});
dom('bank-file').addEventListener('change', async e => {
  const input = e.target;
  if (!input.files.length) return;
  if (session && !window.confirm('Finish or discard your saved session before changing the question bank. Discard it now?')) { input.value = ''; return; }
  input.disabled = true;
  dom('import-status').textContent = 'Importing…';
  try {
    const imported = await readImport(input.files);
    await storedPut(imported);
    session = null;
    clearInterval(timer);
    dom('quiz').hidden = true;
    dom('results').hidden = true;
    dom('setup').hidden = false;
    save();
    for (const url of imageURLs.values()) URL.revokeObjectURL(url);
    imageURLs.clear();
    const importedBank = imported.get('questions');
    if (importedBank) setBank(importedBank);
    const images = [...imported.keys()].filter(isImage).length;
    dom('import-status').textContent = (importedBank ? number(importedBank.length) + ' questions' : 'Question bank retained') + ' · ' + images + ' images imported.';
    if (importedBank) dom('import-status').append(' ', button('Go to study',()=>show('study')));
    refresh();
  } catch (error) { dom('import-status').textContent = error.message || 'Could not save the question bank.'; }
  finally { input.disabled = false; input.value = ''; }
});

refresh();
try {
  const file = await storedGet('questions');
  if (file) setBank(parseQuestions(JSON.stringify(file)));
} catch { dom('import-status').textContent = 'This browser could not read saved study files. You can try importing again.'; }
try {
  const res = await fetch('./podcasts.json');
  if (!res.ok) throw new Error('Podcast list unavailable');
  menu = await res.json();
  dom('podcast-unit').replaceChildren(...menu.units.map(u => {
    const option = element('option', u.unit + '. ' + u.title);
    option.value = u.unit;
    return option;
  }));
} catch {}
renderEpisodes();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
