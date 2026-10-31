import { CATEGORIES, duration, formatDuration, playerById, scoreMatch, setBreakdown, statistics, teamOf, validServeOrder } from './scoring.js';

const KEY = 'cancha-matches-v1';
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let matches = [];
let currentId = null;
let view = 'home';
let draft = null;
let serveDraft = null;
let photos = {};
let loadError = null;
let statsScope = 'all';

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

function players(team, server) {
  return team.players.map(player => `<span class="player-name">${avatar(player)}${escape(player.name)}${player.id === server ?
    '<span class="player-serve-dot" aria-label="Sacador" title="Sacador">●</span>' : ''}</span>`).join('');
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
      <span class="badge ${!state.finished && !match.result && match.runningSince ? 'live' : ''}">${match.result ? match.result.type === 'retirement' ? 'ABANDONO' : 'CIERRE ANTICIPADO' : state.finished ? 'FINALIZADO' : match.pausedAt ? 'PAUSADO' : match.startedAt ? 'EN JUEGO' : 'PREPARADO'}</span></span>
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
    <div class="photo-actions"><label class="photo-field">▧ Galería <input type="file" data-photo="${team}-${number}" accept="image/*" hidden></label>
    <label class="photo-field">◉ Tomar foto <input type="file" data-photo="${team}-${number}" accept="image/*" capture="environment" hidden></label></div>
    <span class="photo-label" id="photo-${team}-${number}"></span>`).join('')}</div>`).join('')}</div></div>
  <div class="panel"><div class="section-head compact"><div><p class="eyebrow">03 / SERVICIO</p><h2>Orden de saque</h2></div></div>
  <p class="muted">El primer sacador inicia el partido. ${doubles ? 'Elegí quién saca segundo en la pareja rival; luego sacan los respectivos compañeros. Podrás ajustar cada pareja antes de su primer game de servicio en cada set.' : 'Después alternan los jugadores.'}</p>
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

function setTiles(match, state, totals, over) {
  return match.teams.map((team, index) => {
    const setCells = [...state.sets.map(set => `<span class="set-cell">${set.games ? set.games[index] : set.tieBreak[index]}</span>`),
      ...Array.from({ length: 3 - state.sets.length }, (_, i) =>
        `<span class="set-cell ${state.setNumber === state.sets.length + i && !state.finished ? 'active-set' : ''}">${state.setNumber === state.sets.length + i && !state.finished ? (state.setNumber === 2 ? state.points[index] : state.games[index]) : '—'}</span>`)
    ].slice(0, 3).join('');
    return `<div class="score-row ${!over && state.server && team.players.some(player => player.id === state.server) ? 'serving' : ''}">
      <div class="score-team"><span class="team-letter">${index === 0 ? 'A' : 'B'}</span><div class="score-players">${players(team, over ? null : state.server)}
        <span class="total-points">TANTOS GANADOS <b>${totals[index]}</b></span></div></div>
      <span class="serve-indicator">${!over && state.server && team.players.some(player => player.id === state.server) ? '● SACA' : ''}</span>
      <div class="set-values">${setCells}</div><strong class="point-value">${state.pointLabels[index]}</strong>
    </div>`;
  });
}

function renderMatch() {
  const match = current();
  if (!match) { view = 'home'; renderHome(); return; }
  const state = scoreMatch(match);
  const over = state.finished || Boolean(match.result);
  const totals = statistics(match).map(team => team.totalWon);
  const order = match.flipped ? [1, 0] : [0, 1];
  const tiles = setTiles(match, state, totals, over);
  app.innerHTML = `<div class="match-toolbar"><button class="back" data-action="home">← Partidos</button>
    <span class="badge ${match.runningSince && !over ? 'live' : ''}">${match.result ? match.result.type === 'retirement' ? 'FINALIZADO · ABANDONO' : 'CIERRE ANTICIPADO' : state.finished ? 'PARTIDO FINALIZADO' : match.pausedAt ? 'PARTIDO PAUSADO' : match.startedAt ? '● EN VIVO' : 'SIN INICIAR'}</span></div>
  <section class="match-heading"><div><p class="eyebrow">${match.type === 'singles' ? 'SINGLES' : 'DOBLES'} · ${date(match.createdAt)}</p><h1>Tablero<span class="accent">.</span></h1></div>
  <div class="timer"><span>TIEMPO DE JUEGO${match.pausedAt ? ' · EN PAUSA' : ''}</span><strong class="clock">${formatDuration(duration(match))}</strong></div></section>
  <section class="scoreboard"><div class="board-top"><span>${over ? 'MARCADOR FINAL' : match.pausedAt ? 'MARCADOR EN PAUSA' : 'MARCADOR EN VIVO'}</span><div class="board-labels"><span>SETS</span><span>${state.tieBreak ? 'TIE-BREAK' : 'PUNTOS'}</span></div></div>
    ${order.map(i => tiles[i]).join('')}
    <div class="board-bottom"><span>${match.result ? match.result.type === 'retirement' ?
      `Ganó ${escape(teamName(match.teams[1 - match.result.retiredTeam]))} por abandono de ${escape(teamName(match.teams[match.result.retiredTeam]))}` :
      `Finalizado anticipadamente · ${escape(match.result.note || 'sin ganador')}` :
      state.finished ? `Ganó ${escape(teamName(match.teams[state.wonSets[0] === 2 ? 0 : 1]))}` :
      state.setNumber === 2 ? 'MATCH TIE-BREAK · A 10, DIFERENCIA DE 2' : state.tieBreak ? 'TIE-BREAK · A 7, DIFERENCIA DE 2' :
      `SET ${state.setNumber + 1} · ${state.games.join('–')} EN GAMES`}</span>
      <button data-action="flip">⇄ Cambiar lados</button></div></section>
  ${match.startedAt ? `<div class="server-strip">${!over && state.server ? `${avatar(playerById(match, state.server))}<div><small>${match.pausedAt ? 'PRÓXIMO SACADOR' : 'SERVICIO ACTUAL'}</small><strong>${escape(playerById(match, state.server).name)}</strong></div>` :
    '<strong>Partido terminado</strong>'}
    ${match.type === 'doubles' && !over && state.setGamesPlayed <= 1 && state.points[0] === 0 && state.points[1] === 0 ?
      `<button class="button outline change-server" data-action="serve-order">${state.setGamesPlayed === 0 ?
        `⇄ Orden de saque · Set ${state.setNumber + 1}` : '⇄ Sacador del otro equipo'}</button>` : ''}</div>` : ''}
  ${!match.startedAt ? `<div class="start-box"><h2>Todo listo para jugar.</h2><p>El reloj comienza al iniciar. Después podés registrar cada tanto.</p>
    <button class="button primary large" data-action="start">▶ Iniciar partido</button></div>` :
    !over && !match.pausedAt ? `<section class="point-entry"><div class="section-head compact"><div><p class="eyebrow">REGISTRO EN VIVO</p><h2>¿Quién ganó el tanto?</h2></div></div>
    <div class="winner-buttons">${order.map(i => `<button class="winner-button" data-action="point" data-winner="${i}"><span>LADO ${i === 0 ? 'A' : 'B'}</span>
      <span class="winner-avatars">${match.teams[i].players.map(avatar).join('')}</span>
      <strong>${escape(teamName(match.teams[i]))}</strong><span>+ Registrar tanto ↗</span></button>`).join('')}</div></section>` :
    match.pausedAt && !over ? `<div class="start-box paused-box"><span class="eyebrow">INTERRUPCIÓN</span><h2>Partido pausado</h2>
      <p>El reloj está detenido y no se pueden registrar tantos hasta reanudar.</p><button class="button primary large" data-action="resume">▶ Reanudar partido</button></div>` :
    `<div class="start-box finished-box"><span class="eyebrow">${match.result ? 'CIERRE ANTICIPADO' : 'GAME · SET · MATCH'}</span><h2>${match.result ? match.result.type === 'retirement' ? 'Finalizado por abandono' : 'Finalizado sin ganador' : 'Partido finalizado'}</h2>
    <p>Tiempo de juego: <strong>${formatDuration(duration(match))}</strong>. Podés consultar o compartir las estadísticas.</p></div>`}
  ${match.startedAt && !over ? `<div class="interruption-actions">${match.pausedAt ? '' : '<button class="button outline" data-action="pause">⏸ Pausar partido</button>'}
    <button class="button outline danger" data-action="end-early">Terminar anticipadamente</button></div>` : ''}
  <div class="match-actions"><button class="button outline" data-action="stats">▤ Estadísticas</button>
    <button class="button outline" data-action="history">◷ Historial ${match.points.length ? `(${match.points.length})` : ''}</button>
    ${match.points.length ? '<button class="button outline" data-action="undo">↶ Deshacer último</button>' : ''}
    <button class="button outline danger" data-action="delete-match">Eliminar partido</button></div>
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
  const fixedActor = draft.category === 'ace' || draft.category === 'double_fault';
  if (fixedActor) draft.actor = server;
  else if (!actorOptions.some(player => player.id === draft.actor)) draft.actor = actorOptions[0].id;
  const valid = !((draft.category === 'ace' && draft.winner !== servingTeam) ||
    (draft.category === 'double_fault' && draft.winner === servingTeam));
  document.querySelector('#dialog-root').innerHTML = `<div class="modal-backdrop" data-action="close-dialog">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><p class="eyebrow">${index === null ? 'NUEVO TANTO' : `CORREGIR TANTO #${index + 1}`}</p>
      <h2 id="modal-title">¿Cómo terminó?</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div>
      <p class="field-label">EQUIPO QUE GANÓ EL TANTO</p>
      <div class="choice-buttons">${match.teams.map((team, i) =>
        `<button class="choice-button ${draft.winner === i ? 'selected' : ''}" data-action="winner" data-winner="${i}" aria-pressed="${draft.winner === i}">
        <span class="choice-avatars">${team.players.map(avatar).join('')}</span>${escape(teamName(team))}</button>`).join('')}</div>
      <div class="category-grid">${['won', 'lost'].map(kind =>
        `<div class="category-column"><p class="field-label">${kind === 'lost' ? 'ERROR / EN CONTRA' : 'GANADOR / A FAVOR'}</p>
        ${Object.entries(CATEGORIES).filter(([, info]) => info.kind === kind).map(([key, info]) =>
          `<button class="category ${draft.category === key ? 'selected' : ''}" data-action="category" data-category="${key}" aria-pressed="${draft.category === key}">${escape(info.label)}</button>`).join('')}</div>`).join('')}</div>
      <p class="field-label">${draft.category === 'double_fault' ? 'SACADOR QUE COMETIÓ LA DOBLE FALTA' : category.kind === 'lost' ? 'JUGADOR QUE COMETIÓ EL ERROR' : 'JUGADOR QUE GANÓ EL PUNTO'}</p>
      <div class="choice-buttons">${fixedActor ? `<span class="choice-button selected fixed-choice">${avatar(playerById(match, server))}${escape(playerById(match, server).name)}</span>` :
        actorOptions.map(player =>
          `<button class="choice-button ${draft.actor === player.id ? 'selected' : ''}" data-action="actor" data-player="${escape(player.id)}" aria-pressed="${draft.actor === player.id}">${avatar(player)}${escape(player.name)}</button>`).join('')}</div>
      ${category.kind === 'lost' ? '<p class="attribution-note">Esta falta o error se cuenta en contra del jugador que lo cometió, no del ganador del tanto.</p>' : ''}
      ${valid ? '' : `<p class="validation">El ${draft.category === 'ace' ? 'ace lo gana' : 'punto por doble falta lo pierde'} el equipo que saca. Cambiá el ganador o el tipo de tanto.</p>`}
      <button class="button primary full" data-action="save-point" ${valid ? '' : 'disabled'}>Guardar tanto →</button>
    </section></div>`;
}

function renderServeDialog() {
  const match = current();
  const groups = serveDraft.secondOnly ? [
    { team: 1 - serveDraft.firstTeam, slot: 'second', label: 'SACA ESTE GAME' }
  ] : [
    { team: serveDraft.firstTeam, slot: 'first', label: 'SACA PRIMERO' },
    { team: 1 - serveDraft.firstTeam, slot: 'second', label: 'SACA SEGUNDO' }
  ];
  document.querySelector('#dialog-root').innerHTML = `<div class="modal-backdrop" data-action="close-dialog">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><p class="eyebrow">SET ${serveDraft.setNumber + 1} · DOBLES</p><h2 id="modal-title">Orden de saque</h2></div>
      <button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div>
      <p class="muted">${serveDraft.secondOnly ?
        'El primer equipo ya sacó. Ahora el equipo rival puede elegir cuál de sus compañeros sirve su primer game de este set, antes de jugar el primer tanto.' :
        'Cada pareja puede elegir su sacador antes de su primer game de servicio. El equipo que sirve primero ya está determinado por el turno del partido.'}</p>
      ${groups.map(({ team, slot, label }) => `<p class="field-label">${label} · LADO ${team === 0 ? 'A' : 'B'}</p>
        <div class="choice-buttons">${match.teams[team].players.map(player =>
          `<button class="choice-button ${serveDraft[slot] === player.id ? 'selected' : ''}" data-action="serve-player" data-slot="${slot}" data-player="${escape(player.id)}" aria-pressed="${serveDraft[slot] === player.id}">${avatar(player)}${escape(player.name)}</button>`).join('')}</div>`).join('')}
      <button class="button primary full" data-action="save-serve-order">Guardar orden de saque →</button>
    </section></div>`;
}

function renderEndDialog() {
  const match = current();
  document.querySelector('#dialog-root').innerHTML = `<div class="modal-backdrop" data-action="close-dialog">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><p class="eyebrow">CIERRE ANTICIPADO</p><h2 id="modal-title">Terminar partido</h2></div>
      <button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div>
      <p class="muted">Se conservarán el marcador y las estadísticas actuales. El reloj se detendrá y no se podrán anotar nuevos tantos.</p>
      <label class="field">Motivo<select id="end-reason"><option value="retirement">Abandono (gana el rival)</option>
        <option value="early_end">Otro motivo (sin ganador)</option></select></label>
      <label class="field" id="retirement-field">Equipo que abandona<select id="retired-team">${match.teams.map((team, i) =>
        `<option value="${i}">${escape(teamName(team))}</option>`).join('')}</select></label>
      <label class="field" id="end-note-field" hidden>Motivo del cierre<input id="end-note" maxlength="120" placeholder="Ej.: suspensión definitiva"></label>
      <button class="button primary full" data-action="confirm-end">Confirmar cierre</button>
    </section></div>`;
}

function renderDetails(kind, scope = 'all') {
  const match = current();
  const detail = document.querySelector('#detail');
  statsScope = kind === 'stats' ? scope : 'all';
  if (kind === 'history') {
    detail.innerHTML = `<section class="detail"><div class="section-head"><div><p class="eyebrow">AUDITORÍA</p><h2>Historial de tantos</h2></div><button class="button subtle" data-action="hide-detail">Cerrar ×</button></div>
    ${match.points.length ? `<div class="history-list">${match.points.map((point, index) => {
      const actor = playerById(match, point.actor);
      return `<div class="history-row"><span class="history-number">${String(index + 1).padStart(2, '0')}</span>
        <div><strong>${escape(teamName(match.teams[point.winner]))}</strong><small>${escape(CATEGORIES[point.category].label)} · ${escape(actor?.name || 'Jugador')} · ${new Date(point.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</small></div>
        <button class="button subtle" data-action="edit" data-index="${index}">Corregir</button></div>`;
    }).reverse().join('')}</div>` : '<p class="muted">Todavía no hay tantos registrados.</p>'}</section>`;
  } else {
    const sets = setBreakdown(match);
    const selected = scope === 'all' ? null : sets[Number(scope)];
    if (scope !== 'all' && !selected) { notify('El set seleccionado ya no está disponible.'); return; }
    const points = selected ? selected.points : match.points;
    const stats = statistics(match, points);
    const row = (label, key) => `<tr><th>${label}${CATEGORIES[key].kind === 'lost' ? ' · en contra' : ''}</th><td>${stats[0].byCategory[key]}</td><td>${stats[1].byCategory[key]}</td></tr>`;
    detail.innerHTML = `<section class="detail"><div class="section-head"><div><p class="eyebrow">RESUMEN DEL PARTIDO</p><h2>Estadísticas</h2></div><button class="button subtle" data-action="hide-detail">Cerrar ×</button></div>
    <div class="stats-scopes"><button class="button ${scope === 'all' ? 'primary' : 'outline'}" data-action="stats-scope" data-set="all" aria-pressed="${scope === 'all'}">Todo el partido</button>
    ${sets.map((set, index) => `<button class="button ${scope === String(index) ? 'primary' : 'outline'}" data-action="stats-scope" data-set="${index}" aria-pressed="${scope === String(index)}">Set ${set.number}${set.complete ? '' : match.result ? ' · sin completar' : !match.startedAt ? ' · sin iniciar' : match.pausedAt ? ' · en pausa' : ' · en curso'}</button>`).join('')}</div>
    <div class="duration-cards"><div class="duration-card"><small>TIEMPO DE JUEGO · PARTIDO</small><strong data-match-clock>${formatDuration(duration(match))}</strong></div>
    ${sets.map(set => `<div class="duration-card"><small>SET ${set.number}${set.complete ? '' : ' · SIN COMPLETAR'}</small>
      <strong ${!set.complete && set.durationMs !== null ? 'data-set-clock' : ''}>${set.durationMs === null ? 'No disponible' : formatDuration(set.durationMs)}</strong></div>`).join('')}</div>
    ${sets.some(set => set.durationMs === null) ? '<p class="storage-note">Los tantos anteriores a esta actualización no guardaban el tiempo de juego al anotarse; su duración por set no se puede recuperar con precisión.</p>' : ''}
    <p class="stats-current">Mostrando ${selected ? `Set ${selected.number}` : 'todo el partido'} · ${points.length} tantos</p>
    <div class="stats-scroll"><table><thead><tr><th>ESTADÍSTICA</th><th>${escape(teamName(match.teams[0]))}</th><th>${escape(teamName(match.teams[1]))}</th></tr></thead>
    <tbody><tr class="total-row"><th>Tantos ganados</th><td>${stats[0].totalWon}</td><td>${stats[1].totalWon}</td></tr>
    ${Object.entries(CATEGORIES).map(([key, info]) => row(info.label, key)).join('')}</tbody></table></div>
    ${match.type === 'doubles' ? `<p class="muted">Detalle individual de tantos atribuidos</p><div class="player-stats">${match.teams.flatMap((team, i) => team.players.map(player =>
      `<div><strong>${escape(player.name)} · ${i === 0 ? 'A' : 'B'}</strong><small>${Object.entries(stats[i].players[player.id]).filter(([, count]) => count).map(([key, count]) => `${escape(CATEGORIES[key].label)}: ${count}`).join(' · ') || 'Sin tantos atribuidos'}</small></div>`)).join('')}</div>` : ''}
    <div class="match-actions"><button class="button outline" data-action="share">↗ Compartir / correo</button>
    <button class="button outline" data-action="export-summary">↓ Descargar resumen</button></div>
    <p class="storage-note">Dobles faltas y errores cuentan para quien los cometió; tantos ganados cuentan para el equipo que sumó el punto.</p></section>`;
  }
  if (scope === 'all' || kind === 'history') detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function summary(match, scope = 'all') {
  const state = scoreMatch(match);
  const sets = setBreakdown(match);
  const selected = scope === 'all' ? null : sets[Number(scope)];
  const stats = statistics(match, selected ? selected.points : match.points);
  const a = teamName(match.teams[0]);
  const b = teamName(match.teams[1]);
  return [
    `CANCHA · ${match.type === 'singles' ? 'Singles' : 'Dobles'} · ${date(match.createdAt)}`,
    `${a} vs ${b}`, `Estado: ${match.result ? match.result.type === 'retirement' ?
      `Finalizado por abandono de ${teamName(match.teams[match.result.retiredTeam])}; ganó ${teamName(match.teams[1 - match.result.retiredTeam])}` :
      `Finalizado anticipadamente sin ganador${match.result.note ? `: ${match.result.note}` : ''}` :
      state.finished ? 'Finalizado' : match.pausedAt ? 'Pausado' : match.startedAt ? 'En juego' : 'Preparado'}`,
    `Sets: ${state.sets.map((set, i) => `Set ${i + 1}: ${set.games ? set.games.join('-') : 'Match tie-break ' + set.tieBreak.join('-')}${set.tieBreak && set.games ? ' (tie-break ' + set.tieBreak.join('-') + ')' : ''}`).join(' | ') || 'Sin sets completos'}`,
    `Tiempo de juego del partido (sin pausas): ${formatDuration(duration(match))}`,
    `Tiempos por set: ${sets.map(set => `Set ${set.number}${set.complete ? '' : ' (sin completar)'}: ${set.durationMs === null ? 'no disponible' : formatDuration(set.durationMs)}`).join(' | ')}`, '',
    `Estadística ${selected ? `Set ${selected.number}` : 'del partido completo'} (${selected ? selected.points.length : match.points.length} tantos) · ${a} / ${b}`,
    `Tantos ganados: ${stats[0].totalWon} / ${stats[1].totalWon}`,
    ...Object.entries(CATEGORIES).map(([key, info]) => `${info.label}${info.kind === 'lost' ? ' (en contra)' : ''}: ${stats[0].byCategory[key]} / ${stats[1].byCategory[key]}`),
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
  if (index === null) event.playMs = duration(match, event.at);
  else if (Number.isFinite(match.points[index].playMs)) event.playMs = match.points[index].playMs;
  const points = [...match.points];
  if (index === null) points.push(event); else points[index] = event;
  let state;
  try { state = scoreMatch(match, points); }
  catch (error) { notify(error.message); return; }
  if (state.finished && match.result) { notify('El partido ya tuvo un cierre anticipado. Esta corrección lo completaría también por marcador.'); return; }
  const next = { ...match, points };
  const wasFinished = scoreMatch(match).finished;
  if (state.finished && !wasFinished) {
    const finishedAt = index === null ? event.at : Date.now();
    if (index !== null && Number.isFinite(event.playMs)) event.playMs = duration(match, finishedAt);
    next.elapsedMs = duration(match, finishedAt);
    next.runningSince = null;
    next.pausedAt = null;
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
      !validServeOrder(match, match.serveOrder) ||
      (match.setServeOrders != null && (match.type !== 'doubles' || typeof match.setServeOrders !== 'object' ||
        Array.isArray(match.setServeOrders) || Object.entries(match.setServeOrders).some(([set, order]) =>
          !/^[012]$/.test(set) || !validServeOrder(match, order)))) ||
      !Array.isArray(match.points) || match.points.some(point => point.playMs != null &&
        (!Number.isFinite(point.playMs) || point.playMs < 0)) ||
      !Number.isFinite(match.createdAt) || (match.startedAt && !Number.isFinite(match.startedAt)) ||
      (match.runningSince && !Number.isFinite(match.runningSince)) || !Number.isFinite(match.elapsedMs) || match.elapsedMs < 0 ||
      (match.pausedAt != null && !Number.isFinite(match.pausedAt)) || (match.pausedAt && (match.runningSince || !match.startedAt)) ||
      (match.result && (!['retirement', 'early_end'].includes(match.result.type) ||
        (match.result.type === 'retirement' && ![0, 1].includes(match.result.retiredTeam)) ||
        (match.result.type === 'early_end' && (typeof match.result.note !== 'string' || match.result.note.length > 120)) ||
        !Number.isFinite(match.result.at) || !match.startedAt || match.runningSince || match.pausedAt))) {
      throw new Error('El respaldo contiene un partido inválido.');
    }
    if (match.result && scoreMatch(match).finished) throw new Error('Un partido no puede terminar por marcador y por abandono.');
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
  if (action === 'home') { event.preventDefault(); view = 'home'; draft = null; serveDraft = null; render(); }
  if (action === 'new') { view = 'setup'; photos = {}; render(); }
  if (action === 'type') { photos = {}; renderSetup(target.dataset.type); }
  if (action === 'open') { currentId = target.dataset.id; view = 'match'; render(); }
  if (action === 'flip') updateMatch({ ...match, flipped: !match.flipped });
  if (action === 'start') {
    const now = Date.now();
    updateMatch({ ...match, startedAt: now, runningSince: now });
  }
  if (action === 'serve-order') {
    const state = scoreMatch(match);
    if (match.type !== 'doubles' || !match.startedAt || match.result || state.finished ||
      state.setGamesPlayed > 1 || state.points[0] !== 0 || state.points[1] !== 0) {
      notify('Cada pareja elige su sacador antes de su primer game de servicio en el set.');
      return;
    }
    serveDraft = { setNumber: state.setNumber, gamesPlayed: state.setGamesPlayed, secondOnly: state.setGamesPlayed === 1,
      firstTeam: teamOf(match, state.serveOrder[0]), first: state.serveOrder[0], second: state.serveOrder[1] };
    renderServeDialog();
  }
  if (action === 'serve-player') {
    if (!serveDraft || !['first', 'second'].includes(target.dataset.slot)) return;
    const team = target.dataset.slot === 'first' ? serveDraft.firstTeam : 1 - serveDraft.firstTeam;
    if (teamOf(match, target.dataset.player) !== team) return;
    serveDraft[target.dataset.slot] = target.dataset.player;
    renderServeDialog();
  }
  if (action === 'save-serve-order') {
    const state = scoreMatch(match);
    if (!serveDraft || match.type !== 'doubles' || match.result || state.finished ||
      state.setNumber !== serveDraft.setNumber || state.setGamesPlayed !== serveDraft.gamesPlayed ||
      state.points[0] !== 0 || state.points[1] !== 0) {
      notify('El primer game de servicio de este equipo ya comenzó. No se puede cambiar su sacador.');
      return;
    }
    const firstTeam = serveDraft.firstTeam;
    const first = serveDraft.first;
    const second = serveDraft.second;
    const order = [first, second,
      match.teams[firstTeam].players.find(player => player.id !== first).id,
      match.teams[1 - firstTeam].players.find(player => player.id !== second).id];
    if (!validServeOrder(match, order) || teamOf(match, first) !== teamOf(match, state.serveOrder[0]) ||
      (serveDraft.secondOnly && first !== state.serveOrder[0])) {
      notify('El orden de saque no corresponde al turno del equipo.');
      return;
    }
    const next = { ...match, setServeOrders: { ...match.setServeOrders, [state.setNumber]: order } };
    try { scoreMatch(next); }
    catch (error) { notify(error.message); return; }
    if (updateMatch(next)) { serveDraft = null; notify('Orden de saque actualizado para este set.'); }
  }
  if (action === 'pause' && match.runningSince && !match.result && !scoreMatch(match).finished) {
    const now = Date.now();
    if (updateMatch({ ...match, elapsedMs: duration(match, now), runningSince: null, pausedAt: now })) notify('Partido pausado. El reloj está detenido.');
  }
  if (action === 'resume' && match.pausedAt && !match.result && !scoreMatch(match).finished) {
    if (updateMatch({ ...match, runningSince: Date.now(), pausedAt: null })) notify('Partido reanudado.');
  }
  if (action === 'end-early' && match.startedAt && !match.result && !scoreMatch(match).finished) renderEndDialog();
  if (action === 'confirm-end') {
    const type = document.querySelector('#end-reason').value;
    const retiredTeam = Number(document.querySelector('#retired-team').value);
    const note = document.querySelector('#end-note').value.trim();
    if (!['retirement', 'early_end'].includes(type) || (type === 'retirement' && ![0, 1].includes(retiredTeam)) ||
      !match.startedAt || match.result || scoreMatch(match).finished) {
      notify('No se puede terminar este partido.');
      return;
    }
    const now = Date.now();
    const result = type === 'retirement' ? { type, retiredTeam, at: now } : { type, note, at: now };
    if (updateMatch({ ...match, elapsedMs: duration(match, now), runningSince: null, pausedAt: null,
      endedAt: now, result })) notify('Partido finalizado anticipadamente.');
  }
  if (action === 'point' || action === 'edit') {
    const index = action === 'edit' ? Number(target.dataset.index) : null;
    const winner = action === 'edit' ? match.points[index].winner : Number(target.dataset.winner);
    draft = { index, winner, category: index === null ? 'other' : match.points[index].category,
      actor: index === null ? match.teams[winner].players[0].id : match.points[index].actor };
    renderPointDialog();
  }
  if (action === 'category') { draft.category = target.dataset.category; renderPointDialog(); }
  if (action === 'winner') { draft.winner = Number(target.dataset.winner); renderPointDialog(); }
  if (action === 'actor') {
    const match = current();
    const actorTeam = CATEGORIES[draft.category].kind === 'lost' ? 1 - draft.winner : draft.winner;
    if (match.teams[actorTeam].players.some(player => player.id === target.dataset.player) &&
      draft.category !== 'ace' && draft.category !== 'double_fault') {
      draft.actor = target.dataset.player;
      document.querySelectorAll('[data-action="actor"]').forEach(button => {
        const selected = button.dataset.player === draft.actor;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }
  }
  if (action === 'close-dialog' && (target === event.target || target.classList.contains('icon-button'))) {
    draft = null; serveDraft = null; document.querySelector('#dialog-root').innerHTML = '';
  }
  if (action === 'save-point') savePoint();
  if (action === 'undo') {
    if (!confirm('¿Deshacer el último tanto? El marcador y las estadísticas se recalcularán.')) return;
    const next = { ...match, points: match.points.slice(0, -1) };
    if (scoreMatch(match).finished) { next.runningSince = Date.now(); next.endedAt = null; }
    if (updateMatch(next)) notify('Último tanto deshecho.');
  }
  if (action === 'delete-match') {
    if (!confirm(`¿Eliminar de este dispositivo el partido ${teamName(match.teams[0])} vs ${teamName(match.teams[1])}? Se borrarán también sus fotos, tantos y estadísticas. No se puede deshacer; exportá un respaldo antes si querés conservarlo.`)) return;
    if (persist(matches.filter(saved => saved.id !== match.id))) {
      currentId = null;
      view = 'home';
      render();
      notify('Partido eliminado de este dispositivo.');
    }
  }
  if (action === 'stats' || action === 'history') renderDetails(action);
  if (action === 'stats-scope') renderDetails('stats', target.dataset.set);
  if (action === 'hide-detail') document.querySelector('#detail').innerHTML = '';
  if (action === 'backup') download(`cancha-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 1, exportedAt: Date.now(), matches }, null, 2), 'application/json');
  if (action === 'export-summary') download(`cancha-partido-${match.id.slice(0, 8)}.txt`, summary(match, statsScope), 'text/plain;charset=utf-8');
  if (action === 'share') {
    const text = summary(match, statsScope);
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
  if (event.target.id === 'end-reason') {
    document.querySelector('#retirement-field').hidden = event.target.value !== 'retirement';
    document.querySelector('#end-note-field').hidden = event.target.value !== 'early_end';
  }
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
    startedAt: null, endedAt: null, elapsedMs: 0, runningSince: null, pausedAt: null, result: null, flipped: false };
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
  const matchClock = document.querySelector('[data-match-clock]');
  if (matchClock) matchClock.textContent = formatDuration(duration(current()));
  const setClock = document.querySelector('[data-set-clock]');
  if (setClock) setClock.textContent = formatDuration(setBreakdown(current()).at(-1).durationMs);
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
