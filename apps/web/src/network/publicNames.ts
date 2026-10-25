const nicknames = [
  'Camille_92',
  'MilaVoyage',
  'AlexR',
  'Loulou',
  'TheoDuSud',
  'Marine33',
  'Jules_7',
  'LinaZen',
  'Maxime',
  'NoraBlue',
  'Sam_Paris',
  'ChloeL',
  'Arthur21',
  'MayaSun',
  'NoeVoyage',
  'LeaRose',
  'TomRivage',
  'Eva_75',
  'HugoM',
  'ZoéAtlas',
  'Lucas_8',
  'EmmaNova',
  'RobinD',
  'AliceNord',
];

/** Natural display names; the public-room interface still discloses AI participants. */
export function publicBotNames(seed: string, occupied: string[], count: number): string[] {
  let cursor = 2166136261;
  for (const character of seed) cursor = Math.imul(cursor ^ character.charCodeAt(0), 16777619);
  const used = new Set(occupied.map((name) => name.toLocaleLowerCase()));
  const chosen: string[] = [];
  for (let attempt = 0; chosen.length < count; attempt++) {
    const base = nicknames[((cursor >>> 0) + attempt) % nicknames.length]!;
    const name = attempt < nicknames.length ? base : `${base.slice(0, 16)}_${attempt}`;
    if (used.has(name.toLocaleLowerCase())) continue;
    used.add(name.toLocaleLowerCase());
    chosen.push(name);
  }
  return chosen;
}
