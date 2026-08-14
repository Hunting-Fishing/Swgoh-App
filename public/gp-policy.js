function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sumPower(units = []) {
  return Math.round(units.reduce((sum, unit) => sum + positive(unit?.power), 0));
}

export function selectProfileGp(player = {}, characters = [], ships = []) {
  const rosterCharacterGp = sumPower(characters);
  const rosterShipGp = sumPower(ships);
  const rosterGp = rosterCharacterGp + rosterShipGp;

  const authoritativeCharacterGp = positive(
    player.characterGalacticPower ?? player.characterGp ?? player.gpChar
  );
  const authoritativeShipGp = positive(
    player.shipGalacticPower ?? player.shipGp ?? player.gpShip
  );
  const authoritativeTotalGp = positive(
    player.galacticPower ?? player.gp ?? player.gpFull
  );

  const characterGp = authoritativeCharacterGp || rosterCharacterGp;
  const shipGp = authoritativeShipGp || rosterShipGp;
  const totalGp = authoritativeTotalGp || characterGp + shipGp;
  const rosterDifference = rosterGp && totalGp ? rosterGp - totalGp : 0;
  const authoritativeSplitGp = authoritativeCharacterGp + authoritativeShipGp;
  const splitDifference = authoritativeTotalGp && authoritativeSplitGp
    ? authoritativeSplitGp - authoritativeTotalGp
    : 0;

  return {
    characterGp,
    shipGp,
    totalGp,
    rosterCharacterGp,
    rosterShipGp,
    rosterGp,
    rosterDifference,
    authoritativeCharacterGp,
    authoritativeShipGp,
    authoritativeTotalGp,
    authoritativeSplitGp,
    splitDifference,
    usesAuthoritativeProfile: Boolean(
      authoritativeTotalGp || authoritativeCharacterGp || authoritativeShipGp
    ),
  };
}

export function describeGpQuality(selection) {
  if (!selection?.usesAuthoritativeProfile) {
    return "Authoritative profile GP was unavailable, so GP is derived from the calculated live roster units.";
  }

  if (selection.authoritativeTotalGp && selection.authoritativeSplitGp && selection.splitDifference !== 0) {
    return `Comlink profile GP is authoritative. Its character + ship split differs from its total by ${Math.abs(selection.splitDifference).toLocaleString()}; the reported profile values are shown unchanged.`;
  }

  if (selection.rosterGp && selection.rosterDifference !== 0) {
    return `Comlink profile GP is authoritative. The calculated per-unit roster differs by ${Math.abs(selection.rosterDifference).toLocaleString()}; the roster sum is diagnostic only.`;
  }

  if (selection.rosterGp) {
    return "Authoritative Comlink profile GP matches the calculated roster total.";
  }

  return "Displaying authoritative Comlink profile GP.";
}
