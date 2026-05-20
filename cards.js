// Catálogo de las 22 cartas únicas del juego Olympus Protocol.
// Las unidades (1-12) tienen copias múltiples para sumar 30 cartas.
// Las habilidades (13-22) son únicas: 1 copia cada una.

export const UNITS = [
  { id: 1,  name: 'Heracles',   subtype: 'Assault',    firepower: 6, armor: 3, copies: 2, image: 'images/1-heracles.png',
    lore: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.' },
  { id: 2,  name: 'Ares',       subtype: 'Assault',    firepower: 7, armor: 2, copies: 2, image: 'images/2-ares.png',
    lore: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.' },
  { id: 3,  name: 'Typhon',     subtype: 'Assault',    firepower: 5, armor: 4, copies: 3, image: 'images/3-typhon.png',
    lore: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.' },
  { id: 4,  name: 'Atlas',      subtype: 'Tank',       firepower: 2, armor: 8, copies: 2, image: 'images/4-atlas.png',
    lore: 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt.' },
  { id: 5,  name: 'Goliath',    subtype: 'Tank',       firepower: 3, armor: 7, copies: 2, image: 'images/5-goliath.png',
    lore: 'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque.' },
  { id: 6,  name: 'Cronos',     subtype: 'Tank',       firepower: 4, armor: 6, copies: 3, image: 'images/6-cronos.png',
    lore: 'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet consectetur.' },
  { id: 7,  name: 'Apollo',     subtype: 'Artillery',  firepower: 5, armor: 2, copies: 2, image: 'images/7-apollo.png',
    lore: 'Eveniet ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit.' },
  { id: 8,  name: 'Zeus',       subtype: 'Artillery',  firepower: 6, armor: 3, copies: 2, image: 'images/8-zeus.png',
    lore: 'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium.' },
  { id: 9,  name: 'Helios',     subtype: 'Artillery',  firepower: 4, armor: 4, copies: 3, image: 'images/9-helios.png',
    lore: 'Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe.' },
  { id: 10, name: 'Hermes',     subtype: 'Support',    firepower: 3, armor: 5, copies: 3, image: 'images/10-hermes.png',
    lore: 'Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus.' },
  { id: 11, name: 'Athena',     subtype: 'Support',    firepower: 4, armor: 5, copies: 3, image: 'images/11-athena.png',
    lore: 'Voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.' },
  { id: 12, name: 'Hephaestus', subtype: 'Support',    firepower: 2, armor: 6, copies: 3, image: 'images/12-hephaestus.png',
    lore: 'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.' },
];

export const SKILLS = [
  { id: 13, name: 'Reactor Overload',       subtype: 'Offensive', effect: 'Tu Front Line gana +3 Firepower este turno.', image: 'images/13-reactor-overload.png' },
  { id: 14, name: 'EMP Pulse',              subtype: 'Offensive', effect: 'Si tu Front Line destruye la Front Line rival, el excedente penetra directamente a la vida del rival (ignora el Armor de su Rear Guard).', image: 'images/14-emp-pulse.png' },
  { id: 15, name: 'Targeting Override',     subtype: 'Offensive', effect: 'Tu Front Line destruye automáticamente la Front Line rival sin importar su Armor. No genera excedente. Tu Front Line sobrevive intacta.', image: 'images/15-targeting-override.png' },
  { id: 16, name: 'Double Shot',            subtype: 'Offensive', effect: 'Tu Front Line ataca dos veces este turno. El segundo ataque utiliza la Firepower original sin excedente acumulado del primero.', image: 'images/16-double-shot.png' },
  { id: 17, name: 'Energy Shield',          subtype: 'Defensive', effect: 'Tu vida no recibe daño este turno. Las cartas pueden ser destruidas, pero el daño residual a la vida se bloquea completamente.', image: 'images/17-energy-shield.png' },
  { id: 18, name: 'Reinforcement Protocol', subtype: 'Defensive', effect: 'Tu Front Line y tu Rear Guard ganan +2 Armor durante el ataque del rival.', image: 'images/18-reinforcement-protocol.png' },
  { id: 19, name: 'Emergency Repulsors',    subtype: 'Defensive', effect: 'Tu Rear Guard es invulnerable este turno. El excedente que la golpearía se anula. La vida sigue siendo vulnerable a otros vectores de daño.', image: 'images/19-emergency-repulsors.png' },
  { id: 20, name: 'Minefield',              subtype: 'Trap',      effect: 'Se activa cuando el rival destruya tu Front Line. La carta atacante también es destruida. El excedente que iba a Rear Guard se anula.', image: 'images/20-minefield.png' },
  { id: 21, name: 'Cyberattack',            subtype: 'Trap',      effect: 'Se activa cuando una trampa del rival cumple su condición de activación. Cancela el efecto de la trampa rival antes de que se aplique. Ambas cartas se descartan.', image: 'images/21-cyberattack.png' },
  { id: 22, name: 'Trap Charge',            subtype: 'Trap',      effect: 'Se activa la primera vez que tu Front Line sobreviva un ataque del rival. Tu Front Line gana +5 Firepower en tu próximo ataque. Si en ese momento tu Front Line está vacía, el bonus se pierde.', image: 'images/22-trap-charge.png' },
];

// Construye el mazo común de 40 cartas (30 unidades + 10 habilidades, cada habilidad 1 copia).
// Cada instancia tiene un instanceId único para distinguir copias múltiples de la misma carta.
export function buildDeck() {
  const deck = [];

  for (const unit of UNITS) {
    for (let i = 0; i < unit.copies; i++) {
      const card = {
        id: unit.id,
        instanceId: `u${unit.id}-${i}`,
        type: 'unit',
        name: unit.name,
        subtype: unit.subtype,
        firepower: unit.firepower,
        armor: unit.armor,
      };
      if (unit.image) card.image = unit.image;
      if (unit.lore) card.lore = unit.lore;
      deck.push(card);
    }
  }

  for (const skill of SKILLS) {
    const card = {
      id: skill.id,
      instanceId: `s${skill.id}`,
      type: 'skill',
      name: skill.name,
      subtype: skill.subtype,
      effect: skill.effect,
    };
    if (skill.image) card.image = skill.image;
    deck.push(card);
  }

  return deck;
}

// Mezcla un array (Fisher-Yates).
export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Cuenta unidades en una mano (para mulligan).
export function countUnits(hand) {
  return hand.filter(c => c.type === 'unit').length;
}
