import { haversineDistanceKm } from "@/lib/geo";

type TeamClusterUser = {
  id: string;
  homeLatitude: number | null;
  homeLongitude: number | null;
};

type BuiltTeam = {
  teamId: string;
  teamName: string;
  pilotId: string | null;
  searcherIds: string[];
};

type OrderForAssignment = {
  id: string;
  field: {
    locationLatitude: number | null;
    locationLongitude: number | null;
  } | null;
};

type AssignmentResult = {
  orderId: string;
  teamId: string;
  distanceKm: number;
};

function getPilotPoint(pilot: TeamClusterUser | undefined) {
  if (
    !pilot ||
    pilot.homeLatitude == null ||
    pilot.homeLongitude == null
  ) {
    return null;
  }

  return {
    lat: pilot.homeLatitude,
    lng: pilot.homeLongitude,
  };
}

function getFieldPoint(order: OrderForAssignment) {
  if (
    !order.field ||
    order.field.locationLatitude == null ||
    order.field.locationLongitude == null
  ) {
    return null;
  }

  return {
    lat: order.field.locationLatitude,
    lng: order.field.locationLongitude,
  };
}

function scoreOrderDistanceWithBalance(params: {
  distanceKm: number;
  currentOrderCount: number;
  teamSize: number;
}) {
  const { distanceKm, currentOrderCount, teamSize } = params;

  return distanceKm + currentOrderCount * 10 - teamSize * 1.5;
}

export function assignOrdersToTeams(
  teams: BuiltTeam[],
  users: TeamClusterUser[],
  orders: OrderForAssignment[]
): AssignmentResult[] {
  const results: AssignmentResult[] = [];
  const orderCountByTeamId = new Map<string, number>();

  for (const team of teams) {
    orderCountByTeamId.set(team.teamId, 0);
  }

  for (const order of orders) {
    const fieldPoint = getFieldPoint(order);
    if (!fieldPoint) continue;

    let bestTeam: BuiltTeam | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const team of teams) {
      if (!team.pilotId) continue;

      const pilot = users.find((u) => u.id === team.pilotId);
      const pilotPoint = getPilotPoint(pilot);
      if (!pilotPoint) continue;

      const distanceKm = haversineDistanceKm(pilotPoint, fieldPoint);
      const currentOrderCount = orderCountByTeamId.get(team.teamId) || 0;
      const teamSize = (team.pilotId ? 1 : 0) + team.searcherIds.length;

      const score = scoreOrderDistanceWithBalance({
        distanceKm,
        currentOrderCount,
        teamSize,
      });

      if (score < bestScore) {
        bestScore = score;
        bestDistance = distanceKm;
        bestTeam = team;
      }
    }

    if (!bestTeam) continue;

    results.push({
      orderId: order.id,
      teamId: bestTeam.teamId,
      distanceKm: bestDistance,
    });

    orderCountByTeamId.set(
      bestTeam.teamId,
      (orderCountByTeamId.get(bestTeam.teamId) || 0) + 1
    );
  }

  return results;
}