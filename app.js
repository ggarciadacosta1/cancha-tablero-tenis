import { CATEGORIES, duration, formatDuration, playerById, scoreMatch, statistics, teamOf } from './scoring.js';

const KEY = 'cancha-matches-v1';
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let matches = [];
let currentId = null;
let view = 'home';
let draft = null;
let photos = {};
let loadError = null;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const uid = () => crypto.randomUUID();
const current = () => matches.find(match => match.id === currentId);
const teamName = team => team.players.map(player => player.name).join(' / ');
const date = value => new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => toast.classList.remove('visible'), 4500);
}

function persist(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    matches = next;
    return true;
  } catch (error) {
    notify(`No se pudo guardar: ${error.name === 'QuotaExceededError' ? 'espacio local agotado. Exportá un respaldo y liberá espacio.' : error.message}`);
    return false;
  }
}

function updateMatch(next) {
  if (!persist(matches.map(match => match.id === next.id ? next : match))) return false;
  render();
  return true;
}

function avatar(player) {
  return player.photo ? `<img class="avatar" src="${escape(player.photo)}" alt="">` :
    `<span class="avatar fallback" aria-hidden="true">${escape(player.name.slice(0, 1).toUpperCase())}</span>`;
}

function players(team) {
  return team.players.map(player => `<span class="player-name">${avatar(player)}${escape(player.name)}</span>`).join('');
}

function renderHome() {
  const sorted = [...matches].sort((a, b) => b.createdAt - a.createdAt);
  app.innerHTML = `<section class="hero">
    <div><p class="eyebrow">EL PARTIDO, BAJO CONTROL</p><h1>Cada punto<br><em>cuenta.</em></h1>
    <p>Un tablero hecho para seguir el juego desde la silla. Sin conexión, sin distracciones.</p>
    <button class="button primary large" data-action="new">+ Nuevo partido <span>↗</span></button></div>
    <div class="hero-court" aria-hidden="true"><div class="court-lines"><span>●</span></div><b>GAME<br>SET<br>MATCH.</b></div>
  </section>
  <section class="section-head"><div><p class="eyebrow">TU REGISTRO</p><h2>Partidos</h2></div>
  <div class="head-actions"><button class="button subtle" data-action="backup">↓ Respaldo</button>
  <label class="button subtle import">↑ Restaurar<input type="file" id="restore-file" accept="application/json,.json" hidden></label></div></section>
  ${sorted.length ? `<div class="match-list">${sorted.map(match => {
    const state = scoreMatch(match);
    return `<button class="match-card" data-action="open" data-id="${escape(match.id)}">
      <span class="match-card-top"><span class="eyebrow">${match.type === 'singles' ? 'SINGLES' : 'DOBLES'} · ${date(match.createdAt)}</span>
      <span class="badge ${state.finished ? '' : 'live'}">${state.finished ? 'FINALIZADO' : match.startedAt ? 'EN JUEGO' : 'PREPARADO'}</span></span>
      <span class="match-card-names">${escape(teamName(match.teams[0]))}<span>VS</span>${escape(teamName(match.teams[1]))}</span>
      <span class="match-card-bottom">${state.sets.map(set => set.games ? set.games.join('–') : `${set.tieBreak.join('–')} TB`).join(' · ') || 'Todavía sin sets'} <span>Ver partido →</span></span>
    </button>`;
  }).join('')}</div>` : `<div class="empty"><span>◎</span><h3>La cancha está lista</h3><p>Creá un partido para empezar a registrar cada tanto.</p></div>`}
  <p class="storage-note">Los datos se guardan solo en este navegador. Exportá un respaldo periódicamente; borrar los datos del navegador también borra los partidos.</p>`;
}

function renderSetup(type = 'singles') {
  const doubles = type === 'doubles';
  const slots = doubles ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0]];
  app.innerHTML = `<section class="page-title"><button class="back" data-action="home">← Partidos</button><p class="eyebrow">CONFIGURACIÓN</p><h1>Nuevo partido<span class="accent">.</span></h1>
  <p>Ingresá los jugadores y definí el orden de saque antes de comenzar.</p></section>
  <form id="setup-form"><div class="panel"><div class="section-head compact"><div><p class="eyebrow">01 / MODALIDAD</p><h2>Tipo de partido</h2></div></div>
  <div class="segmented"><button type="button" class="${doubles ? '' : 'active'}" data-action="type" data-type="singles">Singles</button>
  <button type="button" class="${doubles ? 'active' : ''}" data-action="type" data-type="doubles">Dobles</button></div></div>
  <div class="panel"><div class="section-head compact"><div><p class="eyebrow">02 / PARTICIPANTES</p><h2>Jugadores</h2></div><span class="muted">Foto opcional</span></div>
  <div class="setup-teams">${[0, 1].map(t => `<div class="setup-team"><p class="team-tag">LADO ${t === 0 ? 'A' : 'B'}</p>
    ${slots.filter(([team]) => team === t).map(([team, number]) => `<label class="field">Jugador ${number + 1}
    <input required maxlength="60" name="name-${team}-${number}" placeholder="Nombre del jugador" autocomplete="off"></label>
    <label class="photo-field">＋ Foto <input type="file" data-photo="${team}-${number}" accept="image/*" hidden></label>
    <span class="photo-label" id="photo-${team}-${number}"></span>`).join('')}</div>`).join('')}</div></div>
  <div class="panel"><div class="section-head compact"><div><p class="eyebrow">03 / SERVICIO</p><h2>Orden de saque</h2></div></div>
  <p class="muted">El primer sacador inicia el partido. ${doubles ? 'Elegí quién saca segundo en la pareja rival; luego sacan los respectivos compañeros. El orden permanece fijo.' : 'Después alternan los jugadores.'}</p>
  <div class="setup-teams"><label class="field">Primer sacador<select name="first" id="first-server">${slots.map(([t, n]) => `<option value="${t}-${n}">Lado ${t === 0 ? 'A' : 'B'} · Jugador ${n + 1}</option>`).join('')}</select></label>
  ${doubles ? `<label class="field">Segundo sacador (rival)<select name="second" id="second-server"></select></label>` : ''}</div></div>
  <div class="setup-submit"><button class="button primary large" type="submit">Crear partido <span>→</span></button></div></form>`;
  if (doubles) updateSecondServer();
}

function updateSecondServer() {
  const first = document.querySelector('#first-server');
  const second = document.querySelector('#second-server');
  if (!second) return;
  const other = first.value.startsWith('0') ? 1 : 0;
  second.innerHTML = [0, 1].map(n => `<option value="${other}-${n}">Lado ${other === 0 ? 'A' : 'B'} · Jugador ${n + 1}</option>`).join('');
}

function setTiles(match, state) {
  return match.teams.map((team, index) => {
    const setCells = [...state.sets.map(set => `<span class="set-cell">${set.games ? set.games[index] : set.tieBreak[index]}</span>`),
      ...Array.from({ length: 3 - state.sets.length }, (_, i) =>
        `<span class="set-cell ${state.setNumber === state.sets.length + i && !state.finished ? 'active-set' : ''}">${state.setNumber === state.sets.length + i && !state.finished ? (state.setNumber === 2 ? state.points[index] : state.games[index]) : '—'}</span>`)
    ].slice(0, 3).join('');
    return `<div class="score-row ${state.server && team.players.some(player => player.id === state.server) ? 'serving' : ''}">
      <div class="score-team"><span class="team-letter">${index === 0 ? 'A' : 'B'}</span><div class="score-players">${players(team)}</div></div>
      <span class="serve-indicator">${state.server && team.players.some(player => player.id === state.server) ? '● SACA' : ''}</span>
      <div class="set-values">${setCells}</div><strong class="point-value">${state.pointLabels[index]}</strong>
    </div>`;
  });
}

function renderMatch() {
  const match = current();
  if (!match) { view = 'home'; renderHome(); return; }
  const state = scoreMatch(match);
  const order = match.flipped ? [1, 0] : [0, 1];
  const tiles = setTiles(match, state);
  app.innerHTML = `<div class="match-toolbar"><button class="back" data-action="home">← Partidos</button>
    <span class="badge ${match.startedAt && !state.finished ? 'live' : ''}">${state.finished ? 'PARTIDO FINALIZADO' : match.startedAt ? '● EN VIVO' : 'SIN INICIAR'}</span></div>
  <section class="match-heading"><div><p class="eyebrow">${match.type === 'singles' ? 'SINGLES' : 'DOBLES'} · ${date(match.createdAt)}</p><h1>Tablero<span class="accent">.</span></h1></div>
  <div class="timer"><span>DURACIÓN DEL PARTIDO</span><strong class="clock">${formatDuration(duration(match))}</strong></div></section>
  <section class="scoreboard"><div class="board-top"><span>MARCADOR EN VIVO</span><div class="board-labels"><span>SETS</span><span>${state.tieBreak ? 'TIE-BREAK' : 'PUNTOS'}</span></div></div>
    ${order.map(i => tiles[i]).join('')}
    <div class="board-bottom"><span>${state.finished ? `Ganó ${escape(teamName(match.teams[state.wonSets[0] === 2 ? 0 : 1]))}` :
      state.setNumber === 2 ? 'MATCH TIE-BREAK · A 10, DIFERENCIA DE 2' : state.tieBreak ? 'TIE-BREAK · A 7, DIFERENCIA DE 2' :
      `SET ${state.setNumber + 1} · ${state.games.join('–')} EN GAMES`}</span>
      <button data-action="flip">⇄ Cambiar lados</button></div></section>
  ${match.startedAt ? `<div class="server-strip">${state.server ? `${avatar(playerById(match, state.server))}<div><small>SERVICIO ACTUAL</small><strong>${escape(playerById(match, state.server).name)}</strong></div>` :
    '<strong>Partido terminado</strong>'}</div>` : ''}
  ${!match.startedAt ? `<div class="start-box"><h2>Todo listo para jugar.</h2><p>El reloj comienza al iniciar. Después podés registrar cada tanto.</p>
    <button class="button primary large" data-action="start">▶ Iniciar partido</button></div>` :
    !state.finished ? `<section class="point-entry"><div class="section-head compact"><div><p class="eyebrow">REGISTRO EN VIVO</p><h2>¿Quién ganó el tanto?</h2></div></div>
    <div class="winner-buttons">${order.map(i => `<button class="winner-button" data-action="point" data-winner="${i}"><span>LADO ${i === 0 ? 'A' : 'B'}</span>
      <strong>${escape(teamName(match.teams[i]))}</strong><span>+ Registrar tanto ↗</span></button>`).join('')}</div></section>` :
    `<div class="start-box finished-box"><span class="eyebrow">GAME · SET · MATCH</span><h2>Partido finalizado</h2>
    <p>Duración total: <strong>${formatDuration(duration(match))}</strong>. Podés consultar o compartir las estadísticas.</p></div>`}
  <div class="match-actions"><button class="button outline" data-action="stats">▤ Estadísticas</button>
    <button class="button outline" data-action="history">◷ Historial ${match.points.length ? `(${match.points.length})` : ''}</button>
    ${match.points.length ? '<button class="button outline" data-action="undo">↶ Deshacer último</button>' : ''}</div>
  <div id="detail"></div><div id="dialog-root"></div>`;
}

function pointAt(match, index) {
  const previous = scoreMatch(match, match.points.slice(0, index));
  return previous.server;
}

function renderPointDialog() {
  const match = current();
  const index = draft.index;
  const server = pointAt(match, index === null ? match.points.length : index);
  const servingTeam = teamOf(match, server);
  const category = CATEGORIES[draft.category];
  const actorTeam = category.kind === 'lost' ? 1 - draft.winner : draft.winner;
  const actorOptions = match.teams[actorTeam].players;
  if (draft.category === 'ace' || draft.category === 'double_fault') draft.actor = server;
  else if (!actorOptions.some(player => player.id === draft.actor)) draft.actor = actorOptions[0].id;
  const valid = !((draft.category === 'ace' && draft.winner !== servingTeam) ||
    (draft.category === 'double_fault' && draft.winner === servingTeam));
  document.querySelector('#dialog-root').innerHTML = `<div class="modal-backdrop" data-action="close-dialog">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><p class="eyebrow">${index === null ? 'NUEVO TANTO' : `CORREGIR TANTO #${index + 1}`}</p>
      <h2 id="modal-title">¿Cómo terminó?</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div>
      <label class="field">Ganador<select id="point-winner">${match.teams.map((team, i) =>
        `<option value="${i}" ${draft.winner === i ? 'selected' : ''}>${escape(teamName(team))}</option>`).join('')}</select></label>
      <p class="field-label">TIPO DE TANTO</p><div class="category-grid">${Object.entries(CATEGORIES).map(([key, info]) =>
        `<button class="category ${draft.category === key ? 'selected' : ''}" data-action="category" data-category="${key}">${escape(info.label)}</button>`).join('')}</div>
      <label class="field">Jugador ${category.kind === 'lost' ? 'que cometió el error' : 'que ganó el punto'}
      <select id="point-actor" ${draft.category === 'ace' || draft.category === 'double_fault' ? 'disabled' : ''}>${actorOptions.map(player =>
        `<option value="${escape(player.id)}" ${draft.actor === player.id ? 'selected' : ''}>${escape(player.name)}</option>`).join('')}</select></label>
      ${valid ? '' : `<p class="validation">El ${draft.category === 'ace' ? 'ace lo gana' : 'punto por doble falta lo pierde'} el equipo que saca. Cambiá el ganador o el tipo de tanto.</p>`}
      <button class="button primary full" data-action="save-point" ${valid ? '' : 'disabled'}>Guardar tanto →</button>
    </section></div>`;
}

function renderDetails(kind) {
  const match = current();
  const state = scoreMatch(match);
  const detail = document.querySelector('#detail');
  if (kind === 'history') {
    detail.innerHTML = `<section class="detail"><div class="section-head"><div><p class="eyebrow">AUDITORÍA</p><h2>Historial de tantos</h2></div><button class="button subtle" data-action="hide-detail">Cerrar ×</button></div>
    ${match.points.length ? `<div class="history-list">${match.points.map((point, index) => {
      const actor = playerById(match, point.actor);
      return `<div class="history-row"><span class="history-number">${String(index + 1).padStart(2, '0')}</span>
        <div><strong>${escape(teamName(match.teams[point.winner]))}</strong><small>${escape(CATEGORIES[point.category].label)} · ${escape(actor?.name || 'Jugador')} · ${new Date(point.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</small></div>
        <button class="button subtle" data-action="edit" data-index="${index}">Corregir</button></div>`;
    }).reverse().join('')}</div>` : '<p class="muted">Todavía no hay tantos registrados.</p>'}</section>`;
  } else {
    const stats = statistics(match);
    const row = (label, key) => `<tr><th>${label}</th><td>${stats[0].byCategory[key]}</td><td>${stats[1].byCategory[key]}</td></tr>`;
    detail.innerHTML = `<section class="detail"><div class="section-head"><div><p class="eyebrow">RESUMEN DEL PARTIDO</p><h2>Estadísticas</h2></div><button class="button subtle" data-action="hide-detail">Cerrar ×</button></div>
    <div class="stats-scroll"><table><thead><tr><th>ESTADÍSTICA</th><th>${escape(teamName(match.teams[0]))}</th><th>${escape(teamName(match.teams[1]))}</th></tr></thead>
    <tbody><tr class="total-row"><th>Tantos ganados</th><td>${stats[0].totalWon}</td><td>${stats[1].totalWon}</td></tr>
    ${Object.entries(CATEGORIES).map(([key, info]) => row(info.label, key)).join('')}</tbody></table></div>
    ${match.type === 'doubles' ? `<p class="muted">Detalle individual de tantos atribuidos</p><div class="player-stats">${match.teams.flatMap((team, i) => team.players.map(player =>
      `<div><strong>${escape(player.name)} · ${i === 0 ? 'A' : 'B'}</strong><small>${Object.entries(stats[i].players[player.id]).filter(([, count]) => count).map(([key, count]) => `${escape(CATEGORIES[key].label)}: ${count}`).join(' · ') || 'Sin tantos atribuidos'}</small></div>`)).join('')}</div>` : ''}
    <div class="match-actions"><button class="button outline" data-action="share">↗ Compartir / correo</button>
    <button class="button outline" data-action="export-summary">↓ Descargar resumen</button></div>
    <p class="storage-note">Resumen basado en ${match.points.length} tantos. Un error se atribuye al jugador que lo cometió; los demás al que ejecutó la acción.</p></section>`;
  }
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function summary(match) {
  const state = scoreMatch(match);
  const stats = statistics(match);
  const a = teamName(match.teams[0]);
  const b = teamName(match.teams[1]);
  return [
    `CANCHA · ${match.type === 'singles' ? 'Singles' : 'Dobles'} · ${date(match.createdAt)}`,
    `${a} vs ${b}`, `Estado: ${state.finished ? 'Finalizado' : match.startedAt ? 'En juego' : 'Preparado'}`,
    `Sets: ${state.sets.map((set, i) => `Set ${i + 1}: ${set.games ? set.games.join('-') : 'Match tie-break ' + set.tieBreak.join('-')}${set.tieBreak && set.games ? ' (tie-break ' + set.tieBreak.join('-') + ')' : ''}`).join(' | ') || 'Sin sets completos'}`,
    `Duración: ${formatDuration(duration(match))}`, '',
    `Estadística                         ${a} / ${b}`,
    `Tantos ganados: ${stats[0].totalWon} / ${stats[1].totalWon}`,
    ...Object.entries(CATEGORIES).map(([key, info]) => `${info.label}: ${stats[0].byCategory[key]} / ${stats[1].byCategory[key]}`),
    '', 'Registro generado con Cancha. Los datos originales permanecen en el dispositivo.'
  ].join('\n');
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function savePoint() {
  const match = current();
  const index = draft.index;
  const event = { winner: draft.winner, category: draft.category, actor: draft.actor, at: index === null ? Date.now() : match.points[index].at };
  const points = [...match.points];
  if (index === null) points.push(event); else points[index] = event;
  let state;
  try { state = scoreMatch(match, points); }
  catch (error) { notify(error.message); return; }
  const next = { ...match, points };
  const wasFinished = scoreMatch(match).finished;
  if (state.finished && !wasFinished) {
    const finishedAt = index === null ? event.at : Date.now();
    next.elapsedMs = duration(match, finishedAt);
    next.runningSince = null;
    next.endedAt = finishedAt;
  } else if (!state.finished && wasFinished) {
    next.runningSince = Date.now();
    next.endedAt = null;
  }
  if (updateMatch(next)) { draft = null; notify(index === null ? 'Tanto registrado.' : 'Tanto corregido. Marcador recalculado.'); }
}

async function resizeImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Seleccioná una imagen válida.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 320 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally { URL.revokeObjectURL(objectUrl); }
}

function validBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.matches)) throw new Error('Formato de respaldo no reconocido.');
  for (const match of data.matches) {
    if (!match || typeof match.id !== 'string' || !['singles', 'doubles'].includes(match.type) ||
      !Array.isArray(match.teams) || match.teams.length !== 2 ||
      match.teams.some(team => !Array.isArray(team.players) || team.players.length !== (match.type === 'singles' ? 1 : 2) ||
        team.players.some(p => typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim() ||
          (p.photo && (typeof p.photo !== 'string' || !p.photo.startsWith('data:image/jpeg;base64,'))))) ||
      !Array.isArray(match.serveOrder) || match.serveOrder.length !== (match.type === 'singles' ? 2 : 4) ||
      new Set(match.serveOrder).size !== match.serveOrder.length ||
      match.serveOrder.some(id => teamOf(match, id) < 0) ||
      match.serveOrder.some((id, i) => teamOf(match, id) === teamOf(match, match.serveOrder[(i + 1) % match.serveOrder.length])) ||
      !Array.isArray(match.points) || !Number.isFinite(match.createdAt) || (match.startedAt && !Number.isFinite(match.startedAt)) ||
      (match.runningSince && !Number.isFinite(match.runningSince)) || !Number.isFinite(match.elapsedMs) || match.elapsedMs < 0) {
      throw new Error('El respaldo contiene un partido inválido.');
    }
    scoreMatch(match);
  }
  if (new Set(data.matches.map(match => match.id)).size !== data.matches.length) throw new Error('El respaldo contiene partidos duplicados.');
  return data.matches;
}

function render() {
  if (loadError) {
    app.innerHTML = `<section class="empty"><h2>No se pudo leer el almacenamiento local</h2><p>${escape(loadError)}</p>
    <p>No se modificarán los datos existentes. Podés restaurar un respaldo válido.</p>
    <label class="button primary import">Restaurar respaldo<input type="file" id="restore-file" accept="application/json,.json" hidden></label></section>`;
    return;
  }
  if (view === 'home') renderHome();
  else if (view === 'setup') renderSetup();
  else renderMatch();
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const match = current();
  if (action === 'home') { event.preventDefault(); view = 'home'; draft = null; render(); }
  if (action === 'new') { view = 'setup'; photos = {}; render(); }
  if (action === 'type') { photos = {}; renderSetup(target.dataset.type); }
  if (action === 'open') { currentId = target.dataset.id; view = 'match'; render(); }
  if (action === 'flip') updateMatch({ ...match, flipped: !match.flipped });
  if (action === 'start') {
    const now = Date.now();
    updateMatch({ ...match, startedAt: now, runningSince: now });
  }
  if (action === 'point' || action === 'edit') {
    const index = action === 'edit' ? Number(target.dataset.index) : null;
    const winner = action === 'edit' ? match.points[index].winner : Number(target.dataset.winner);
    draft = { index, winner, category: index === null ? 'other' : match.points[index].category,
      actor: index === null ? match.teams[winner].players[0].id : match.points[index].actor };
    renderPointDialog();
  }
  if (action === 'category') { draft.category = target.dataset.category; renderPointDialog(); }
  if (action === 'close-dialog' && (target === event.target || target.classList.contains('icon-button'))) {
    draft = null; document.querySelector('#dialog-root').innerHTML = '';
  }
  if (action === 'save-point') savePoint();
  if (action === 'undo') {
    if (!confirm('¿Deshacer el último tanto? El marcador y las estadísticas se recalcularán.')) return;
    const next = { ...match, points: match.points.slice(0, -1) };
    if (scoreMatch(match).finished) { next.runningSince = Date.now(); next.endedAt = null; }
    if (updateMatch(next)) notify('Último tanto deshecho.');
  }
  if (action === 'stats' || action === 'history') renderDetails(action);
  if (action === 'hide-detail') document.querySelector('#detail').innerHTML = '';
  if (action === 'backup') download(`cancha-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 1, exportedAt: Date.now(), matches }, null, 2), 'application/json');
  if (action === 'export-summary') download(`cancha-partido-${match.id.slice(0, 8)}.txt`, summary(match), 'text/plain;charset=utf-8');
  if (action === 'share') {
    const text = summary(match);
    if (navigator.share) {
      try { await navigator.share({ title: 'Resumen del partido · Cancha', text }); }
      catch (error) { if (error.name !== 'AbortError') notify(`No se pudo compartir: ${error.message}`); }
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent('Resumen del partido · Cancha')}&body=${encodeURIComponent(text)}`;
    }
  }
});

document.addEventListener('change', async event => {
  if (event.target.id === 'first-server') updateSecondServer();
  if (event.target.id === 'point-winner') { draft.winner = Number(event.target.value); renderPointDialog(); }
  if (event.target.id === 'point-actor') draft.actor = event.target.value;
  if (event.target.dataset.photo) {
    const slot = event.target.dataset.photo;
    try {
      if (event.target.files[0]) {
        photos[slot] = await resizeImage(event.target.files[0]);
        document.getElementById(`photo-${slot}`).textContent = `✓ ${event.target.files[0].name}`;
      }
    } catch (error) { notify(`No se pudo cargar la foto: ${error.message}`); }
  }
  if (event.target.id === 'restore-file' && event.target.files[0]) {
    try {
      const restored = validBackup(JSON.parse(await event.target.files[0].text()));
      const collisions = restored.filter(match => matches.some(existing => existing.id === match.id));
      if (collisions.length && !confirm(`Hay ${collisions.length} partido(s) con el mismo identificador. Se reemplazarán con la versión del respaldo. ¿Continuar?`)) return;
      if (persist([...matches.filter(match => !restored.some(saved => saved.id === match.id)), ...restored])) {
        loadError = null;
        render();
        notify(`${restored.length} partido(s) restaurado(s).`);
      }
    } catch (error) { notify(`No se pudo restaurar: ${error.message}`); }
    event.target.value = '';
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'setup-form') return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const type = form.querySelector('#second-server') ? 'doubles' : 'singles';
  const count = type === 'doubles' ? 2 : 1;
  const teams = [0, 1].map(t => ({ players: Array.from({ length: count }, (_, n) => ({
    id: uid(), name: data.get(`name-${t}-${n}`).trim(), photo: photos[`${t}-${n}`] || null
  })) }));
  const fromSlot = slot => { const [t, n] = slot.split('-').map(Number); return teams[t].players[n].id; };
  const first = data.get('first');
  const serveOrder = type === 'singles' ? [fromSlot(first), fromSlot(first.startsWith('0') ? '1-0' : '0-0')] :
    [fromSlot(first), fromSlot(data.get('second')), fromSlot(`${first[0]}-${1 - Number(first[2])}`),
      fromSlot(`${data.get('second')[0]}-${1 - Number(data.get('second')[2])}`)];
  const now = Date.now();
  const match = { id: uid(), type, teams, serveOrder, points: [], createdAt: now,
    startedAt: null, endedAt: null, elapsedMs: 0, runningSince: null, flipped: false };
  if (persist([...matches, match])) { currentId = match.id; view = 'match'; photos = {}; render(); }
});

document.querySelector('#home-link').addEventListener('click', event => {
  event.preventDefault(); view = 'home'; render();
});
const status = document.querySelector('#network-status');
function refreshNetwork() { status.textContent = navigator.onLine ? '● LISTO SIN CONEXIÓN' : '● SIN CONEXIÓN'; }
window.addEventListener('online', refreshNetwork);
window.addEventListener('offline', refreshNetwork);
setInterval(() => {
  if (view !== 'match' || !current()) return;
  const clock = document.querySelector('.clock');
  if (clock) clock.textContent = formatDuration(duration(current()));
}, 1000);
try {
  const raw = localStorage.getItem(KEY);
  if (raw) matches = validBackup({ version: 1, matches: JSON.parse(raw) });
} catch (error) { loadError = error.message; }
refreshNetwork();
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(error => notify(`No se pudo habilitar el modo sin conexión: ${error.message}`));
}
