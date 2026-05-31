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

type Point = {
  lat: number;
  lng: number;
};

type AssignedOrder = {
  order: OrderForAssignment;
  fieldPoint: Point;
  distanceKm: number;
};

type TeamRouteState = {
  team: BuiltTeam;
  pilotPoint: Point | null;
  currentPoint: Point | null;
  assignedOrders: AssignedOrder[];
};

function getPilotPoint(pilot: TeamClusterUser | undefined): Point | null {
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

function getFieldPoint(order: OrderForAssignment): Point | null {
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

function getTeamSize(team: BuiltTeam) {
  return (team.pilotId ? 1 : 0) + team.searcherIds.length;
}

function scoreOrderForTeam(params: {
  teamState: TeamRouteState;
  fieldPoint: Point;
}) {
  const { teamState, fieldPoint } = params;

  const currentOrderCount = teamState.assignedOrders.length;
  const teamSize = getTeamSize(teamState.team);

  const distanceFromCurrentPoint = teamState.currentPoint
    ? haversineDistanceKm(teamState.currentPoint, fieldPoint)
    : Number.POSITIVE_INFINITY;

  const distanceFromPilot = teamState.pilotPoint
    ? haversineDistanceKm(teamState.pilotPoint, fieldPoint)
    : Number.POSITIVE_INFINITY;

  /*
    Ziel:
    - Teams sollen räumlich zusammenhängende Aufträge bekommen.
    - Teams sollen trotzdem halbwegs gleichmäßig belastet werden.
    - Größere Teams dürfen leicht bevorzugt werden.
    - Der Pilot-Wohnort bleibt wichtig, aber nicht mehr allein entscheidend.
  */
  const routeDistance =
    Number.isFinite(distanceFromCurrentPoint) && distanceFromCurrentPoint !== Number.POSITIVE_INFINITY
      ? distanceFromCurrentPoint
      : distanceFromPilot;

  if (!Number.isFinite(routeDistance)) {
    return currentOrderCount * 100 - teamSize * 2;
  }

  return (
    routeDistance +
    currentOrderCount * 8 +
    (Number.isFinite(distanceFromPilot) ? distanceFromPilot * 0.25 : 0) -
    teamSize * 1.5
  );
}

function optimizeOrderSequenceForTeam(
  teamState: TeamRouteState
): AssignmentResult[] {
  const remaining = [...teamState.assignedOrders];
  const result: AssignmentResult[] = [];

  let currentPoint =
    teamState.pilotPoint ||
    remaining[0]?.fieldPoint ||
    null;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];

      const distance = currentPoint
        ? haversineDistanceKm(currentPoint, candidate.fieldPoint)
        : 0;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    const [nextOrder] = remaining.splice(bestIndex, 1);

    result.push({
      orderId: nextOrder.order.id,
      teamId: teamState.team.teamId,
      distanceKm: Number.isFinite(bestDistance)
        ? bestDistance
        : nextOrder.distanceKm,
    });

    currentPoint = nextOrder.fieldPoint;
  }

  return result;
}

export function assignOrdersToTeams(
  teams: BuiltTeam[],
  users: TeamClusterUser[],
  orders: OrderForAssignment[]
): AssignmentResult[] {
  const usableTeams = teams.filter((team) => !!team.pilotId);

  if (usableTeams.length === 0) {
    return [];
  }

  const teamStates: TeamRouteState[] = usableTeams.map((team) => {
    const pilot = users.find((user) => user.id === team.pilotId);
    const pilotPoint = getPilotPoint(pilot);

    return {
      team,
      pilotPoint,
      currentPoint: pilotPoint,
      assignedOrders: [],
    };
  });

  const assignableOrders = orders
    .map((order) => ({
      order,
      fieldPoint: getFieldPoint(order),
    }))
    .filter(
      (
        item
      ): item is {
        order: OrderForAssignment;
        fieldPoint: Point;
      } => item.fieldPoint !== null
    );

  /*
    Erste Verteilung:
    Jeder Auftrag wird dem Team zugeordnet, für das er nach aktueller Route,
    Pilotentfernung, Teamgröße und bisheriger Auftragsanzahl am besten passt.
  */
  for (const item of assignableOrders) {
    let bestTeamState: TeamRouteState | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestDistanceFromPilot = Number.POSITIVE_INFINITY;

    for (const teamState of teamStates) {
      const score = scoreOrderForTeam({
        teamState,
        fieldPoint: item.fieldPoint,
      });

      const distanceFromPilot = teamState.pilotPoint
        ? haversineDistanceKm(teamState.pilotPoint, item.fieldPoint)
        : Number.POSITIVE_INFINITY;

      if (score < bestScore) {
        bestScore = score;
        bestTeamState = teamState;
        bestDistanceFromPilot = distanceFromPilot;
      }
    }

    if (!bestTeamState) {
      continue;
    }

    bestTeamState.assignedOrders.push({
      order: item.order,
      fieldPoint: item.fieldPoint,
      distanceKm: Number.isFinite(bestDistanceFromPilot)
        ? bestDistanceFromPilot
        : 0,
    });

    /*
      Wichtig:
      currentPoint wird direkt auf diesen Auftrag gesetzt.
      Dadurch bevorzugt der nächste Auftrag räumliche Nähe zur aktuellen Route.
    */
    bestTeamState.currentPoint = item.fieldPoint;
  }

  /*
    Zweite Optimierung:
    Innerhalb jedes Teams wird die Reihenfolge nochmal nach
    "nächstgelegener Auftrag zuerst" sortiert.
  */
  const optimizedAssignments: AssignmentResult[] = [];

  for (const teamState of teamStates) {
    const optimizedForTeam = optimizeOrderSequenceForTeam(teamState);
    optimizedAssignments.push(...optimizedForTeam);
  }

  return optimizedAssignments;
}