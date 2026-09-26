import type { StandingRecord } from "../../db/tournament";

function percentage(value: number) {
  return `${(value * 100).toFixed(1)} %`;
}

export function StandingsBoard({ standings }: { standings: StandingRecord[] }) {
  if (!standings.length) return <div className="empty-state">SIN JUGADORES PARA ESTA RONDA</div>;

  return (
    <div className="standings-list">
      <table className="standings-table">
        <thead><tr>
          <th scope="col">Pos.</th><th scope="col">Jugador</th><th scope="col" title="Victorias / Empates / Derrotas">V / E / D</th>
          <th scope="col">Pts</th><th scope="col" title="Porcentaje de victorias de oponentes">OMW %</th>
          <th scope="col" title="Porcentaje de juegos ganados">GW %</th>
          <th scope="col" title="Porcentaje de juegos ganados de oponentes">OGW %</th>
        </tr></thead>
        <tbody>{standings.map((player, index) => (
          <tr key={player.playerId}>
            <td className="standings-rank">{String(index + 1).padStart(2, "0")}</td>
            <th scope="row" className="standings-name" title={player.name}>{player.name}</th>
            <td>{player.wins} / {player.draws} / {player.losses}</td>
            <td className="standings-points">{player.matchPoints}</td>
            <td>{percentage(player.opponentMatchWinPercentage)}</td>
            <td>{percentage(player.gameWinPercentage)}</td>
            <td>{percentage(player.opponentGameWinPercentage)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
