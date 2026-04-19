import { haversineDistanceKm } from "@/lib/geo";

type User = {
  id: string;
  role: string;
  homeLatitude: number | null;
  homeLongitude: number | null;
  autoAssignPriority?: number;
  isPrimaryPilot?: boolean;
};

type Team = {
  pilotId: string | null;
  members: string[];
};

function getPoint(user: User) {
  if (
    typeof user.homeLatitude !== "number" ||
    typeof user.homeLongitude !== "number"
  ) {
    return null;
  }

  return {
    lat: user.homeLatitude,
    lng: user.homeLongitude,
  };
}

function scoreDistanceWithBalance(params: {
  distanceKm: number;
  teamMemberCount: number;
  priority: number;
}) {
  const { distanceKm, teamMemberCount, priority } = params;

  return distanceKm + teamMemberCount * 12 - priority * 3;
}

export function buildTeamsByDistance(
  users: User[],
  maxSearchersPerTeam: number
): Team[] {
  const pilots = users
    .filter((u) => u.role === "PILOT")
    .sort((a, b) => {
      const aPrimary = a.isPrimaryPilot ? 1 : 0;
      const bPrimary = b.isPrimaryPilot ? 1 : 0;

      if (aPrimary !== bPrimary) {
        return bPrimary - aPrimary;
      }

      return (b.autoAssignPriority || 0) - (a.autoAssignPriority || 0);
    });

  const searchers = users
    .filter((u) => u.role !== "PILOT")
    .sort((a, b) => {
      return (b.autoAssignPriority || 0) - (a.autoAssignPriority || 0);
    });

  const used = new Set<string>();

  const teams: Team[] = pilots.map((pilot) => {
    used.add(pilot.id);

    return {
      pilotId: pilot.id,
      members: [],
    };
  });

  for (const searcher of searchers) {
    if (used.has(searcher.id)) continue;

    const searcherPoint = getPoint(searcher);

    let bestTeam: Team | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const candidateTeams = teams.filter(
      (team) => team.members.length < maxSearchersPerTeam
    );

    if (candidateTeams.length === 0) {
      break;
    }

    for (const team of candidateTeams) {
      const pilot = users.find((u) => u.id === team.pilotId);
      if (!pilot) continue;

      const pilotPoint = getPoint(pilot);

      if (!searcherPoint || !pilotPoint) {
        const fallbackScore =
          team.members.length * 100 - (searcher.autoAssignPriority || 0);

        if (fallbackScore < bestScore) {
          bestScore = fallbackScore;
          bestTeam = team;
        }
        continue;
      }

      const distanceKm = haversineDistanceKm(pilotPoint, searcherPoint);

      const score = scoreDistanceWithBalance({
        distanceKm,
        teamMemberCount: team.members.length,
        priority: searcher.autoAssignPriority || 0,
      });

      if (score < bestScore) {
        bestScore = score;
        bestTeam = team;
      }
    }

    if (bestTeam) {
      bestTeam.members.push(searcher.id);
      used.add(searcher.id);
    }
  }

  return teams;
}