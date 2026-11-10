export const CATEGORIES = {
  ace: { label: 'Ace', kind: 'won' },
  double_fault: { label: 'Doble falta', kind: 'lost' },
  forehand_winner: { label: 'Derecha ganadora', kind: 'won' },
  backhand_winner: { label: 'Revés ganador', kind: 'won' },
  forehand_error: { label: 'Error no forzado · derecha', kind: 'lost' },
  backhand_error: { label: 'Error no forzado · revés', kind: 'lost' },
  net_won: { label: 'Punto ganado en la red', kind: 'won' },
  net_lost: { label: 'Punto perdido en la red', kind: 'lost' },
  other: { label: 'Otro', kind: 'won' },
  simple: { label: 'Tanto registrado', kind: 'won' }
};

const gameLabels = ['0', '15', '30', '40'];

export function teamOf(match, playerId) {
  return match.teams.findIndex(team => team.players.some(player => player.id === playerId));
}

export function playerById(match, id) {
  return match.teams.flatMap(team => team.players).find(player => player.id === id);
}

export function validServeOrder(match, order) {
  const players = match.teams.flatMap(team => team.players);
  return Array.isArray(order) && order.length === players.length &&
    new Set(order).size === players.length &&
    order.every((id, i) => players.some(player => player.id === id) &&
      teamOf(match, id) !== teamOf(match, order[(i + 1) % order.length]));
}

function nextSetOrder(match, order, gamesPlayed, setNumber, finished) {
  const rotated = order.map((_, i) => order[(i + gamesPlayed) % order.length]);
  if (finished) return rotated;
  const chosen = match.setServeOrders?.[setNumber] || rotated;
  if (!validServeOrder(match, chosen) || teamOf(match, chosen[0]) !== teamOf(match, rotated[0])) {
    throw new Error('El orden de saque del set no respeta el turno del equipo que sirve.');
  }
  return chosen;
}

export function formatDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  return `${String(hours).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function gamePointLabel(points, team) {
  const own = points[team];
  const other = points[1 - team];
  if (own >= 3 && other >= 3) {
    if (own === other) return '40';
    return own > other ? 'AD' : '40';
  }
  return gameLabels[Math.min(own, 3)];
}

export function scoreMatch(match, events = match.points) {
  const sets = [];
  let games = [0, 0];
  let points = [0, 0];
  let completedGames = 0;
  let finished = false;
  let setNumber = 0;
  let setStartPointIndex = 0;
  let setGamesPlayed = 0;
  let serveOrder = match.setServeOrders?.[0] || match.serveOrder;
  const wonSets = [0, 0];
  if (!validServeOrder(match, serveOrder) ||
    teamOf(match, serveOrder[0]) !== teamOf(match, match.serveOrder[0])) {
    throw new Error('El orden inicial de saque es inválido.');
  }

  for (const [eventIndex, event] of events.entries()) {
    if (finished) throw new Error('Hay tantos posteriores al final del partido.');
    if (!Number.isInteger(event.winner) || event.winner < 0 || event.winner > 1 || !CATEGORIES[event.category]) {
      throw new Error('El historial contiene un tanto inválido.');
    }
    const server = serverFor(match, { setNumber, games, points, setGamesPlayed, serveOrder });
    const actorTeam = CATEGORIES[event.category].kind === 'lost' ? 1 - event.winner : event.winner;
    if ((event.category === 'simple' ? (match.mode !== 'simple' || event.actor != null) : (match.mode === 'simple' || teamOf(match, event.actor) !== actorTeam)) ||
      (event.category === 'ace' && (event.winner !== teamOf(match, server) || event.actor !== server)) ||
      (event.category === 'double_fault' && (event.winner === teamOf(match, server) || event.actor !== server))) {
      throw new Error('El jugador o el tipo de tanto no corresponde al saque y al ganador.');
    }
    points[event.winner]++;
    const tieBreak = setNumber === 2 || (games[0] === 6 && games[1] === 6);
    if (tieBreak) {
      const target = setNumber === 2 ? 10 : 7;
      if (points[event.winner] >= target && points[event.winner] - points[1 - event.winner] >= 2) {
        const score = setNumber === 2 ? [...points] : [7, 6].map((_, i) => i === event.winner ? 7 : 6);
        sets.push({ games: setNumber === 2 ? null : score, tieBreak: [...points], winner: event.winner,
          startPointIndex: setStartPointIndex, endPointIndex: eventIndex });
        setStartPointIndex = eventIndex + 1;
        wonSets[event.winner]++;
        completedGames++;
        setGamesPlayed++;
        games = [0, 0];
        points = [0, 0];
        setNumber++;
        finished = wonSets[event.winner] === 2;
        serveOrder = nextSetOrder(match, serveOrder, setGamesPlayed, setNumber, finished);
        setGamesPlayed = 0;
      }
    } else if (points[event.winner] >= 4 && points[event.winner] - points[1 - event.winner] >= 2) {
      games[event.winner]++;
      completedGames++;
      setGamesPlayed++;
      points = [0, 0];
      if (games[event.winner] >= 6 && games[event.winner] - games[1 - event.winner] >= 2) {
        sets.push({ games: [...games], tieBreak: null, winner: event.winner,
          startPointIndex: setStartPointIndex, endPointIndex: eventIndex });
        setStartPointIndex = eventIndex + 1;
        wonSets[event.winner]++;
        games = [0, 0];
        setNumber++;
        finished = wonSets[event.winner] === 2;
        serveOrder = nextSetOrder(match, serveOrder, setGamesPlayed, setNumber, finished);
        setGamesPlayed = 0;
      }
    }
  }
  const tieBreak = !finished && (setNumber === 2 || (games[0] === 6 && games[1] === 6));
  return {
    sets, wonSets, games, points, completedGames, setGamesPlayed, serveOrder, setNumber, setStartPointIndex, tieBreak, finished,
    server: finished ? null : serverFor(match, { setNumber, games, points, setGamesPlayed, serveOrder }),
    pointLabels: finished ? ['—', '—'] : tieBreak ? points.map(String) : [gamePointLabel(points, 0), gamePointLabel(points, 1)]
  };
}

export function serverFor(match, state) {
  const { setNumber, games, points } = state;
  const order = state.serveOrder || match.serveOrder;
  const gamesPlayed = state.setGamesPlayed ?? state.completedGames;
  const tieBreak = setNumber === 2 || (games[0] === 6 && games[1] === 6);
  const pointNumber = points[0] + points[1];
  const offset = tieBreak ? (pointNumber === 0 ? 0 : Math.floor((pointNumber + 1) / 2)) : 0;
  return order[(gamesPlayed + offset) % order.length];
}

export function statistics(match, points = match.points) {
  const stats = match.teams.map(team => ({
    totalWon: 0,
    byCategory: Object.fromEntries(Object.keys(CATEGORIES).map(category => [category, 0])),
    players: Object.fromEntries(team.players.map(player => [player.id, Object.fromEntries(Object.keys(CATEGORIES).map(category => [category, 0]))]))
  }));
  for (const point of points) {
    stats[point.winner].totalWon++;
    const team = CATEGORIES[point.category].kind === 'lost' ? 1 - point.winner : point.winner;
    if (point.category === 'simple') continue;
    stats[team].byCategory[point.category]++;
    if (stats[team].players[point.actor]) stats[team].players[point.actor][point.category]++;
  }
  return stats;
}

export function duration(match, now = Date.now()) {
  return (match.elapsedMs || 0) + (match.runningSince ? Math.max(0, now - match.runningSince) : 0);
}

export function setBreakdown(match, now = Date.now()) {
  const state = scoreMatch(match);
  const sets = state.sets.map((set, index) => {
    const start = index === 0 ? 0 : match.points[state.sets[index - 1].endPointIndex].playMs;
    const end = match.points[set.endPointIndex].playMs;
    return {
      number: index + 1, complete: true,
      points: match.points.slice(set.startPointIndex, set.endPointIndex + 1),
      durationMs: Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null
    };
  });
  if (!state.finished) {
    const start = state.setNumber === 0 ? 0 : match.points[state.sets.at(-1).endPointIndex].playMs;
    const end = duration(match, now);
    sets.push({
      number: state.setNumber + 1, complete: false,
      points: match.points.slice(state.setStartPointIndex),
      durationMs: Number.isFinite(start) && end >= start ? end - start : null
    });
  }
  return sets;
}
