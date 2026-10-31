export const CATEGORIES = {
  ace: { label: 'Ace', kind: 'won' },
  double_fault: { label: 'Doble falta', kind: 'lost' },
  forehand_winner: { label: 'Derecha ganadora', kind: 'won' },
  backhand_winner: { label: 'Revés ganador', kind: 'won' },
  forehand_error: { label: 'Error no forzado · derecha', kind: 'lost' },
  backhand_error: { label: 'Error no forzado · revés', kind: 'lost' },
  net_won: { label: 'Punto ganado en la red', kind: 'won' },
  net_lost: { label: 'Punto perdido en la red', kind: 'lost' },
  other: { label: 'Otro', kind: 'won' }
};

const gameLabels = ['0', '15', '30', '40'];

export function teamOf(match, playerId) {
  return match.teams.findIndex(team => team.players.some(player => player.id === playerId));
}

export function playerById(match, id) {
  return match.teams.flatMap(team => team.players).find(player => player.id === id);
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
  const wonSets = [0, 0];

  for (const event of events) {
    if (finished) throw new Error('Hay tantos posteriores al final del partido.');
    if (!Number.isInteger(event.winner) || event.winner < 0 || event.winner > 1 || !CATEGORIES[event.category]) {
      throw new Error('El historial contiene un tanto inválido.');
    }
    const server = serverFor(match, { setNumber, games, points, completedGames });
    const actorTeam = CATEGORIES[event.category].kind === 'lost' ? 1 - event.winner : event.winner;
    if (teamOf(match, event.actor) !== actorTeam ||
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
        sets.push({ games: setNumber === 2 ? null : score, tieBreak: [...points], winner: event.winner });
        wonSets[event.winner]++;
        completedGames++;
        games = [0, 0];
        points = [0, 0];
        setNumber++;
        finished = wonSets[event.winner] === 2;
      }
    } else if (points[event.winner] >= 4 && points[event.winner] - points[1 - event.winner] >= 2) {
      games[event.winner]++;
      completedGames++;
      points = [0, 0];
      if (games[event.winner] >= 6 && games[event.winner] - games[1 - event.winner] >= 2) {
        sets.push({ games: [...games], tieBreak: null, winner: event.winner });
        wonSets[event.winner]++;
        games = [0, 0];
        setNumber++;
        finished = wonSets[event.winner] === 2;
      }
    }
  }
  const tieBreak = !finished && (setNumber === 2 || (games[0] === 6 && games[1] === 6));
  return {
    sets, wonSets, games, points, completedGames, setNumber, tieBreak, finished,
    server: finished ? null : serverFor(match, { setNumber, games, points, completedGames }),
    pointLabels: finished ? ['—', '—'] : tieBreak ? points.map(String) : [gamePointLabel(points, 0), gamePointLabel(points, 1)]
  };
}

export function serverFor(match, state) {
  const { setNumber, games, points, completedGames } = state;
  const tieBreak = setNumber === 2 || (games[0] === 6 && games[1] === 6);
  const pointNumber = points[0] + points[1];
  const offset = tieBreak ? (pointNumber === 0 ? 0 : Math.floor((pointNumber + 1) / 2)) : 0;
  return match.serveOrder[(completedGames + offset) % match.serveOrder.length];
}

export function statistics(match) {
  const stats = match.teams.map(team => ({
    totalWon: 0,
    byCategory: Object.fromEntries(Object.keys(CATEGORIES).map(category => [category, 0])),
    players: Object.fromEntries(team.players.map(player => [player.id, Object.fromEntries(Object.keys(CATEGORIES).map(category => [category, 0]))]))
  }));
  for (const point of match.points) {
    stats[point.winner].totalWon++;
    const team = CATEGORIES[point.category].kind === 'lost' ? 1 - point.winner : point.winner;
    stats[team].byCategory[point.category]++;
    if (stats[team].players[point.actor]) stats[team].players[point.actor][point.category]++;
  }
  return stats;
}

export function duration(match, now = Date.now()) {
  return (match.elapsedMs || 0) + (match.runningSince ? Math.max(0, now - match.runningSince) : 0);
}
