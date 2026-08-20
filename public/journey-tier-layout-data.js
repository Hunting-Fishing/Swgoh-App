export const SOLO_JOURNEY_TIERS = Object.freeze([
  Object.freeze({
    tier: 1,
    label: 'Tier I',
    recommendation: 'Recommended for players of any level',
    journeys: Object.freeze([
      { name: 'Emperor Palpatine' },
      { name: 'Grand Master Yoda' },
      { name: 'R2-D2' },
      { name: 'Grand Admiral Thrawn' },
      { name: 'Padmé Amidala', aliases: ['Padme Amidala'] },
      { name: 'BB-8' },
    ]),
  }),
  Object.freeze({
    tier: 2,
    label: 'Tier II',
    recommendation: 'Recommended for players with 500K+ GP',
    journeys: Object.freeze([
      { name: 'Commander Luke Skywalker' },
      { name: 'Chewbacca' },
      { name: 'C-3PO' },
      { name: 'Rey (Jedi Training)' },
      { name: 'The Mandalorian (Beskar Armor)' },
      { name: 'Jedi Knight Cal Kestis', presetId: 'JOURNEY_JEDIKNIGHTCAL' },
      { name: 'Jedi Knight Revan' },
      { name: 'Darth Revan' },
      { name: 'Chimaera' },
    ]),
  }),
  Object.freeze({
    tier: 3,
    label: 'Tier III',
    recommendation: 'Recommended for players with 1M+ GP',
    journeys: Object.freeze([
      { name: 'Jedi Master Mace Windu' },
      { name: 'Jar Jar Binks', presetId: 'JOURNEY_JARJARBINKS' },
      { name: 'Doctor Aphra', presetId: 'JOURNEY_DOCTORAPHRA' },
      { name: 'Grand Inquisitor', presetId: 'JOURNEY_GRANDINQUISITOR' },
      { name: 'Starkiller', presetId: 'JOURNEY_STARKILLER' },
      { name: 'Darth Malak' },
      { name: "Han's Millennium Falcon", aliases: ['Han’s Millennium Falcon'] },
    ]),
  }),
  Object.freeze({
    tier: 4,
    label: 'Tier IV',
    recommendation: 'Recommended for players with 1.5M+ GP',
    journeys: Object.freeze([
      { name: 'Cassian Andor (Undercover)' },
      { name: 'Maul (Hate-Fueled)' },
      { name: 'General Skywalker' },
    ]),
  }),
  Object.freeze({
    tier: 5,
    label: 'Tier V',
    recommendation: 'Recommended for players with 2M+ GP',
    journeys: Object.freeze([
      { name: 'Jedi Knight Luke Skywalker' },
      { name: "Bo-Katan (Mand'alor)", presetId: 'JOURNEY_BOKATANMANDALOR' },
      { name: 'Baylan Skoll', presetId: 'JOURNEY_BAYLANSKOLL' },
      { name: 'Executor', presetId: 'JOURNEY_CAPITALEXECUTOR' },
      { name: 'Profundity', presetId: 'JOURNEY_CAPITALPROFUNDITY' },
      { name: 'Leviathan', presetId: 'JOURNEY_CAPITALLEVIATHAN' },
    ]),
  }),
]);

export const GUILD_JOURNEY_GROUPS = Object.freeze([
  Object.freeze({
    id: 'raids',
    label: 'Guild Raids',
    journeys: Object.freeze([
      { name: 'Han Solo' },
      { name: 'Darth Traya' },
      { name: 'General Kenobi' },
    ]),
  }),
  Object.freeze({
    id: 'territory-battles',
    label: 'Territory Battles',
    journeys: Object.freeze([
      { name: 'Third Sister', aliases: ['Third Sister (Reva)', 'Reva'] },
      { name: 'Imperial Probe Droid' },
      { name: 'Wat Tambor' },
      { name: 'Rebel Officer Leia Organa' },
      { name: 'Ki-Adi-Mundi' },
    ]),
  }),
]);

export const JOURNEY_TIER_LAYOUT_SOURCE = Object.freeze({
  label: '2026 Journey Guide reorganization',
  source: 'SWGOH.GG / Capital Games',
  published: '2026',
});
