import { isImage, parseQuestions } from './bank.js';

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
const metricNames = ['Questions in bank', 'Questions seen', 'Accuracy'];
const stateKey = 'cia2-desk-progress-v1';
let history = {};
let session = null;
let lastReview = null;
let bank = [];
let questionsById = new Map();
let groups = new Map();
let picked = new Set();
let bankStatus = 'Loading questions…';
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
function save() { localWrite(stateKey, {history, session, lastReview}); }
const stored = localRead(stateKey, {});
history = stored.history ?? {};
session = stored.session ?? null;
lastReview = stored.lastReview ?? null;
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
  for (const name of ['study','listen']) dom(name).hidden = name !== page;
  for (const item of document.querySelectorAll('[data-page]')) {
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  if (page === 'listen') void refreshPodcasts();
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
const examPools = () => domains.map(([, , key]) => bank.filter(q => q.exam_domain_key === key));
function examAllocation(size, pools) {
  const quotas = domains.map(([weight]) => size * weight / 100);
  const counts = quotas.map(Math.floor);
  const order = quotas.map((value, i) => [i, value - counts[i]]).sort((a,b) => b[1] - a[1]);
  for (let left = size - counts.reduce((a,b) => a+b,0), i = 0; i < left; i++) counts[order[i][0]]++;
  return counts.every((n, i) => n <= pools[i].length) ? counts : null;
}
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
  const isExam = current === 'exam';
  const count = isExam ? Number(dom('amount').value) :
    (current === 'practice' ? practicePool() : missed()).length;
  const available = isExam ? Boolean(examAllocation(count, examPools())) : count > 0;
  dom('topic-count').textContent = '· ' + number(count) + ' questions';
  dom('topic-picker').hidden = current !== 'practice' || !bank.length;
  dom('session-settings').hidden = !bank.length;
  dom('exam-length').hidden = !isExam;
  dom('timer-setting').hidden = isExam;
  dom('exam-note').hidden = !isExam;
  if (isExam) dom('exam-note').textContent = number(count) + ' questions · ' +
    number(count * 1.2) + ' minutes · 50 / 40 / 10 exam blueprint';
  dom('setup-note').textContent = !bank.length ? bankStatus :
    !available ? (isExam ? 'The bank cannot support this exam length. Choose a shorter exam.' : 'No questions available for this session.') :
    isExam ? '' : number(count) + (count === 1 ? ' question' : ' questions') + ' in this session.';
  const start = dom('start');
  start.textContent = ({practice:'Start practice', exam:'Start exam simulation', missed:'Review missed questions'})[current];
  start.disabled = !available;
  const resume = dom('resume-session');
  resume.replaceChildren();
  if (session && bank.length) resume.append(button('Resume saved session', resumeQuiz, 'primary'));
  if (lastReview?.ids.some(id => questionsById.has(id))) resume.append(button('Review last session', renderResults));
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
  if (!bank.length) return;
  if (session && !window.confirm('Replace your saved session with a new one?')) return;
  const type = mode();
  const size = Number(dom('amount').value);
  const pools = type === 'exam' ? examPools() : [];
  const allocation = type === 'exam' ? examAllocation(size, pools) : null;
  if (type === 'exam' && !allocation) {
    dom('setup-note').textContent = 'That count cannot match the blueprint with the available questions. Try a smaller count.';
    return;
  }
  const items = allocation ? shuffled(pools.flatMap((pool, i) => shuffled(pool).slice(0, allocation[i]))) :
    shuffled(type === 'practice' ? practicePool() : missed());
  begin(items, type, type === 'exam' || dom('timing').value === '1');
}
function begin(items, type, timed = false) {
  if (!items.length) return;
  const minutes = timed ? items.length * 1.2 : 0;
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
function attachImage(parent, name, alt, zoom = false) {
  if (!parent.isConnected) return;
  const url = new URL(name, location.href).href;
  const img = element('img', null, 'figure');
  img.addEventListener('error', () => {
    (zoom ? img.parentElement : img)?.replaceWith(element('span', 'Image unavailable.', 'muted'));
  }, {once:true});
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
  lastReview = {...completed, note};
  save();
  renderResults();
}
function renderResults() {
  if (!lastReview) return;
  clearInterval(timer);
  const completed = lastReview;
  const evaluated = completed.ids.map((id, i) => [questionsById.get(id), completed.answers[i]]).filter(([q]) => q);
  const right = evaluated.filter(([q,a]) => q.correct_answer === a).length;
  const total = completed.type === 'exam' ? evaluated.length : evaluated.filter(([,a]) => a).length;
  const card = element('div', null, 'card');
  card.append(element('h2', 'Session results'), element('p', right + ' / ' + total + ' correct', 'score'));
  if (completed.note) card.append(element('p', completed.note, 'muted'));
  if (completed.type === 'exam') card.append(element('p', 'Practice score · ' + pct(right,total), 'muted'));
  const incorrect = evaluated.filter(([q,a]) => a && q.correct_answer !== a);
  const actions = element('div', null, 'actions');
  if (incorrect.length) actions.append(button('Redo wrong questions (' + incorrect.length + ')', () => {
    if (session && !window.confirm('Replace your saved session with this retry?')) return;
    begin(shuffled(incorrect.map(([q]) => q)), 'missed');
  }, 'primary'));
  actions.append(button('New session', () => {
    dom('results').hidden = true; dom('setup').hidden = false; refresh();
  }));
  const filter = element('label', 'Show questions');
  const select = element('select');
  for (const [value, title] of [['all','All questions'],['missed','Incorrect and unanswered']]) {
    const option = element('option', title);
    option.value = value;
    select.append(option);
  }
  filter.append(select);
  const review = element('div');
  function drawReview() {
    const items = select.value === 'all' ? evaluated : evaluated.filter(([q,a]) => q.correct_answer !== a);
    review.replaceChildren();
    for (const [q, a] of items) {
      const item = element('article', null, 'review-item');
      item.append(element('p','Unit ' + q.unit_number + ' · ' + q.subunit_title,'muted'));
      if (q.context) item.append(element('div', q.context, 'context'));
      item.append(element('h3', q.question), element('p','Your answer: ' + (a ?? 'Unanswered') + ' · Correct answer: ' + q.correct_answer,'muted'));
      const choices = new Set(Object.values(q.options).filter(isImage));
      for (const name of new Set([...(q.images ?? []), q.image].filter(isImage))) {
        if (!choices.has(name)) queueMicrotask(() => { void attachImage(item, name, 'Question exhibit', true); });
      }
      const list = element('div', null, 'choices');
      for (const letter of keys) {
        const value = q.options[letter];
        const status = (letter === q.correct_answer ? ' · Correct' : '') + (letter === a ? ' · Your answer' : '');
        const row = element('div',null,'review-choice' + (letter === q.correct_answer ? ' correct' : letter === a ? ' wrong' : ''));
        row.append(element('strong',letter + status), element('br'));
        if (isImage(value)) queueMicrotask(() => { void attachImage(row, value, 'Image choice ' + letter, true); });
        else row.append(document.createTextNode(value));
        list.append(row);
      }
      item.append(list);
      review.append(item);
    }
    if (!items.length) review.append(element('p','No items to review.','muted'));
  }
  select.addEventListener('change', drawReview);
  drawReview();
  card.append(actions, filter, review);
  dom('quiz').hidden = true;
  dom('setup').hidden = true;
  dom('results').replaceChildren(card);
  dom('results').hidden = false;
  refresh();
  window.scrollTo(0, 0);
}

function renderEpisodes() {
  const selected = menu.units.find(u => String(u.unit) === dom('podcast-unit').value);
  const units = selected ? [selected] : menu.units;
  const container = dom('episodes');
  container.replaceChildren();
  if (!units.length) { container.append(element('p','Podcast list unavailable. Reopen Podcasts to try again.','muted')); return; }
  const unitIds = new Set(units.map(u => String(u.unit)));
  const matchesUnit = id => unitIds.has(id.split('.')[0]);
  const unitTracks = units.flatMap(u => u.tracks);
  const uploads = (menu.recordings ?? []).filter(track =>
    track.ready && track.topics.some(matchesUnit));
  const uploadedFiles = new Set(uploads.map(track => track.file));
  const tracks = [...new Map(
    [...uploads, ...unitTracks.filter(track => !uploadedFiles.has(track.file) && (selected || track.ready))]
      .map(track => [track.file, track])
  ).values()];
  const available = tracks.filter(t => t.ready);
  if (!tracks.length) container.append(element('p','No recordings are available yet.','muted'));
  if (available.length) container.append(button('Play available episodes', () => loadTrack(available,0)));
  for (const track of tracks) {
    const row = element('div',null,'episode');
    const title = element('span');
    const links = track.topics ? track.topics.filter(matchesUnit).map(id =>
      id.includes('.') ? unitTracks.find(t => t.id === id)?.title ?? id : 'Whole Unit ' + id) : [];
    title.append(element('strong',track.title),element('small',links.length ? links.join(' · ') : track.ready ? 'Available' : 'Coming soon'));
    row.append(title);
    if (track.ready) row.append(button('Play',()=>loadTrack(available,available.indexOf(track))));
    container.append(row);
  }
}
function loadTrack(tracks, index) {
  const item = tracks[index];
  if (!item) return;
  audio.pause();
  playlist = tracks;
  episodeIndex = index;
  dom('now-playing').hidden = false;
  dom('track-title').textContent = item.title;
  dom('audio-status').textContent = '';
  dom('next-track').disabled = index + 1 >= tracks.length;
  audio.src = new URL(item.file, location.href).href;
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
refresh();
try {
  const response = await fetch('./questions_part2.json');
  if (!response.ok) throw new Error('Question bank unavailable');
  setBank(parseQuestions(await response.text()));
} catch {
  bankStatus = 'Could not load questions. Check your connection and reload.';
  refresh();
}
async function refreshPodcasts() {
  if (!menu.units.length) dom('episodes').textContent = 'Loading podcasts…';
  try {
    const res = await fetch('./podcasts.json', {cache:'no-cache'});
    if (!res.ok) throw new Error('Podcast list unavailable');
    menu = await res.json();
    const picker = dom('podcast-unit');
    const selected = picker.value;
    const all = element('option', 'All available episodes');
    all.value = '';
    picker.replaceChildren(all, ...menu.units.map(u => {
      const option = element('option', u.unit + '. ' + u.title);
      option.value = u.unit;
      option.selected = String(u.unit) === selected;
      return option;
    }));
  } catch {}
  renderEpisodes();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).catch(()=>{});
