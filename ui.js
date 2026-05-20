// UI del simulador Olympus Protocol — modo 1v1 online sobre Firebase RTDB.
// Flujo:
//   1) Carga: parsea ?room=XYZ. Si hay, muestra modal "Unirse" pre-rellenado.
//      Si no, muestra menú principal (Crear / Unirme).
//   2) Crear: arma config, llama createRoom(), muestra waiting-modal con código.
//   3) Unirme: llama joinRoom(code), si tiene éxito esconde modales y entra al juego.
//   4) Una vez en sala: subscribeToRoom() escucha cambios y re-renderiza.
//   5) Cada acción local muta el game local y luego escribe el state a Firebase.
//
// Limitaciones de esta fase (Phase 1):
//   - El estado completo es público (no hay split público/privado todavía).
//   - Ambos jugadores ven toda la información (manos, skills bocaabajo).
//   - El control de acciones por seat se aplica en el cliente (no en RTDB rules).
//   - La privacidad real y rules vendrán en Phase 2.

import { Game } from './game.js';
import { userPromise } from './firebase-config.js';
import {
  createRoom, joinRoom, listenRoom, writeState, getMySeat,
  getRoomIdFromURL, buildRoomURL, setRoomInURL,
} from './room.js';

// Cache-busting: bump esta cadena cuando se actualicen imágenes para
// forzar al navegador a redescargarlas en vez de servirlas de caché.
const ASSET_VERSION = '12';

// ──────────────────────────────────────────────────────────────────
// Estado global del UI
// ──────────────────────────────────────────────────────────────────
let game = null;
let roomId = null;
let localSeat = null;          // 1 o 2 — qué jugador soy en esta pestaña
let userId = null;             // mi Firebase UID
let unsubRoom = null;          // función de unsubscribe del listener de Firebase
let selectedCardInstanceId = null;
let selectedPlayerId = null;
let isAnimating = false;
let frozenState = null;
let lastCombatLogLength = 0;

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function visibleState() { return frozenState || game; }

function snapshot(g) {
  return {
    phase: g.phase,
    activePlayer: g.activePlayer,
    turnNumber: g.turnNumber,
    players: {
      1: cloneVisiblePlayer(g.players[1]),
      2: cloneVisiblePlayer(g.players[2]),
    },
    setupState: g.setupState ? { ...g.setupState } : null,
    turnState: g.turnState ? { ...g.turnState } : null,
    combatLog: [...g.combatLog],
    config: g.config,
    gameOver: g.gameOver,
  };
}
function cloneVisiblePlayer(p) {
  return {
    life: p.life,
    deckSize: p.deck.length,
    hand: [...p.hand],
    frontLine: p.frontLine,
    rearGuard: p.rearGuard,
    skill: p.skill ? { card: p.skill.card, state: p.skill.state } : null,
    pendingEffects: [...p.pendingEffects],
  };
}

function showModal(id) { $(id).classList.remove('hidden'); }
function hideModal(id) { $(id).classList.add('hidden'); }
function hideAllModals() {
  for (const id of ['main-menu-modal', 'create-modal', 'join-modal', 'waiting-modal', 'endgame-modal']) {
    hideModal(id);
  }
}

// ──────────────────────────────────────────────────────────────────
// Inicialización
// ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setupModalHandlers();
  setupBoardClickHandlers();
  hideAllModals();

  // Esperamos a Firebase Anonymous Auth
  try {
    const user = await userPromise;
    userId = user.uid;
    console.log('[firebase] uid =', userId);
  } catch (err) {
    console.error('[firebase] sign-in failed:', err);
    alert('No se pudo conectar con Firebase. Revisa tu conexión y recarga.');
    return;
  }

  // Si la URL trae ?room=XYZ, pre-rellena y muestra el modal de unirse.
  const codeFromUrl = getRoomIdFromURL();
  if (codeFromUrl) {
    $('join-code').value = codeFromUrl;
    showModal('join-modal');
  } else {
    showModal('main-menu-modal');
  }
});

// ──────────────────────────────────────────────────────────────────
// Modales: handlers
// ──────────────────────────────────────────────────────────────────
function setupModalHandlers() {
  $('btn-create').addEventListener('click', () => {
    hideAllModals();
    showModal('create-modal');
  });
  $('btn-join').addEventListener('click', () => {
    hideAllModals();
    showModal('join-modal');
  });
  $('btn-create-confirm').addEventListener('click', handleCreate);
  $('btn-create-cancel').addEventListener('click', () => {
    hideAllModals();
    showModal('main-menu-modal');
  });
  $('btn-join-confirm').addEventListener('click', handleJoin);
  $('btn-join-cancel').addEventListener('click', () => {
    hideAllModals();
    showModal('main-menu-modal');
  });
  $('btn-copy-url').addEventListener('click', handleCopyURL);
  $('menu-restart').addEventListener('click', handleRestart);
  $('endgame-new').addEventListener('click', handleRestart);

  // Permite enviar con Enter en el input de código
  $('join-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoin();
  });
}

async function handleCreate() {
  try {
    const config = {
      vidaInicial: parseInt($('config-vida').value, 10) || 20,
      maxTurnos: parseInt($('config-turnos').value, 10) || 20,
      forceP1Start: $('config-force-p1').checked,
    };
    const { roomId: newRoomId } = await createRoom(config);
    roomId = newRoomId;
    localSeat = 1;
    setRoomInURL(newRoomId);
    hideAllModals();
    showModal('waiting-modal');
    $('waiting-code').textContent = newRoomId;
    updateSidebarSeat();
    subscribeToRoom();
  } catch (e) {
    console.error(e);
    alert('Error creando sala: ' + e.message);
  }
}

async function handleJoin() {
  $('join-error').classList.add('hidden');
  try {
    const code = $('join-code').value.toUpperCase().trim();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      showJoinError('El código debe tener 6 caracteres (A-Z sin O/I, 2-9).');
      return;
    }
    const { roomId: joinedRoomId, room } = await joinRoom(code);
    roomId = joinedRoomId;
    localSeat = getMySeat(room, userId);
    if (!localSeat) {
      showJoinError('No se pudo asignar asiento. Intenta de nuevo.');
      return;
    }
    setRoomInURL(joinedRoomId);
    hideAllModals();
    updateSidebarSeat();
    subscribeToRoom();
  } catch (e) {
    console.error(e);
    showJoinError(e.message);
  }
}

function showJoinError(msg) {
  $('join-error').textContent = msg;
  $('join-error').classList.remove('hidden');
}

function handleCopyURL() {
  const url = buildRoomURL(roomId);
  navigator.clipboard.writeText(url).then(() => {
    const btn = $('btn-copy-url');
    btn.textContent = '✓ Copiada';
    setTimeout(() => { btn.textContent = 'Copiar URL'; }, 2000);
  }).catch(() => {
    prompt('Copia esta URL manualmente:', url);
  });
}

function handleRestart() {
  if (!confirm('¿Salir de esta partida y volver al menú?')) return;
  if (unsubRoom) unsubRoom();
  window.location.href = window.location.pathname;
}

function updateSidebarSeat() {
  $('sidebar-seat-label').textContent = localSeat ? `Eres Jugador ${localSeat}` : '—';
  $('sidebar-room-code').textContent = roomId ? `Sala: ${roomId}` : '';
  // Si soy P2, el CSS [data-local-seat="2"] flipea el layout (P2 abajo, P1 arriba)
  const appEl = document.querySelector('.app');
  if (appEl && localSeat) {
    appEl.dataset.localSeat = String(localSeat);
  }
}

// ──────────────────────────────────────────────────────────────────
// Firebase room subscription
// ──────────────────────────────────────────────────────────────────
function subscribeToRoom() {
  if (unsubRoom) unsubRoom();
  unsubRoom = listenRoom(roomId, onRoomUpdate);
}

function onRoomUpdate(room) {
  if (!room || !room.state) return;

  // P1 esperando: si seat 2 todavía vacío, mantén el waiting-modal.
  if (localSeat === 1 && (!room.seats || !room.seats[2])) {
    return; // sigue esperando
  }

  // P2 entró (o estamos ambos): cerrar waiting-modal y entrar al juego.
  hideModal('waiting-modal');

  // Si estamos animando, no sobrescribir el game state todavía (lo dejamos
  // para cuando termine la animación; un breve desfase es aceptable).
  if (isAnimating) return;

  // Reconstruir el game local desde el state de Firebase
  game = Game.fromSerialized(room.state);
  lastCombatLogLength = game.combatLog.length;
  render();

  if (game.phase === 'over') {
    showEndGameModal();
  }
}

// Después de mutar el game local, persistir en Firebase.
async function persistState() {
  if (!roomId || !game) return;
  try {
    await writeState(roomId, game.serialize());
  } catch (e) {
    console.error('Error persistiendo state:', e);
  }
}

// ──────────────────────────────────────────────────────────────────
// Renderizado
// ──────────────────────────────────────────────────────────────────
function render() {
  const g = visibleState();
  if (!g) return;

  renderPlayer(1, g);
  renderPlayer(2, g);
  renderLog(g);
  renderActionBar(g);
  renderActivePlayerHighlight(g);
}

function renderPlayer(playerId, g) {
  const p = g.players[playerId];
  const rivalId = playerId === 1 ? 2 : 1;
  const rival = g.players[rivalId];

  $(`p${playerId}-life`).textContent = p.life;
  $(`p${playerId}-enemy-life`).textContent = rival.life;

  renderSlot(playerId, 'frontLine', p.frontLine);
  renderSlot(playerId, 'rearGuard', p.rearGuard);
  renderSkillSlot(playerId, p.skill);

  $(`p${playerId}-display-turn`).textContent = `T${g.turnNumber}/${g.config ? g.config.maxTurnos : '?'}`;
  $(`p${playerId}-display-active`).textContent = (g.activePlayer === playerId) ? 'ACTIVO' : '';
  $(`p${playerId}-display-pending`).textContent = p.pendingEffects && p.pendingEffects.length > 0
    ? `Pend: ${p.pendingEffects.map(e => e.type).join(', ')}`
    : '';

  renderHand(playerId, p.hand);
}

function renderSlot(playerId, slotName, card) {
  const slotEl = document.querySelector(`.slot[data-player="${playerId}"][data-slot="${slotName}"]`);
  slotEl.innerHTML = '';
  slotEl.classList.toggle('empty', !card);
  slotEl.classList.remove('highlight', 'highlight-replace');

  if (card) {
    slotEl.appendChild(renderCardEl(card));
  } else {
    slotEl.appendChild(el('div', 'slot-label', slotName === 'frontLine' ? 'FRONT LINE' : 'REAR GUARD'));
  }

  if (selectedCardInstanceId && selectedPlayerId && !isAnimating && localSeat === selectedPlayerId) {
    const valids = game.validSlotsFor(selectedPlayerId, selectedCardInstanceId);
    if (valids.includes(slotName) && selectedPlayerId === playerId) {
      slotEl.classList.add('highlight');
    }
  }
}

function renderSkillSlot(playerId, skillState) {
  const slotEl = document.querySelector(`.slot[data-player="${playerId}"][data-slot="skill"]`);
  slotEl.innerHTML = '';
  slotEl.classList.remove('highlight', 'highlight-replace', 'skill-hidden', 'skill-active', 'skill-consumed', 'empty');

  if (skillState) {
    let cardEl;
    if (skillState.state === 'hidden' && localSeat !== playerId) {
      // Skill bocaabajo del rival: mostrar dorso (información oculta)
      cardEl = renderCardBackEl();
    } else {
      cardEl = renderCardEl(skillState.card);
      cardEl.classList.add(`state-${skillState.state}`);
      if (skillState.state === 'hidden') {
        // Mi propia skill bocaabajo: la veo con icono de ojo tachado
        const eye = el('div', 'eye-overlay', '🚫👁');
        cardEl.appendChild(eye);
      }
    }
    slotEl.appendChild(cardEl);
    slotEl.classList.add(`skill-${skillState.state}`);
  } else {
    slotEl.classList.add('empty');
    slotEl.appendChild(el('div', 'slot-label', 'SKILL'));
  }

  if (selectedCardInstanceId && selectedPlayerId === playerId && !isAnimating && localSeat === selectedPlayerId) {
    const valids = game.validSlotsFor(selectedPlayerId, selectedCardInstanceId);
    if (valids.includes('skill')) slotEl.classList.add('highlight');
    if (valids.includes('skill_replace')) slotEl.classList.add('highlight-replace');
  }
}

function renderHand(playerId, hand) {
  const handEl = $(`p${playerId}-hand`);
  handEl.innerHTML = '';
  for (const card of hand) {
    let cardEl;
    if (localSeat === playerId) {
      // Mi propia mano: cartas con cara visible y clickeables.
      cardEl = renderCardEl(card);
      cardEl.classList.add('in-hand');
      cardEl.dataset.playerId = playerId;
      cardEl.dataset.instanceId = card.instanceId;
      if (selectedCardInstanceId === card.instanceId && selectedPlayerId === playerId) {
        cardEl.classList.add('selected');
      }
      cardEl.addEventListener('click', () => onCardClick(playerId, card.instanceId));
    } else {
      // Mano del rival: mostrar dorso.
      cardEl = renderCardBackEl();
      cardEl.classList.add('in-hand', 'not-clickable');
    }
    handEl.appendChild(cardEl);
  }
}

function renderCardBackEl() {
  const cardEl = el('div', 'card card-back');
  const img = document.createElement('img');
  img.src = `images/back.jpg?v=${ASSET_VERSION}`;
  img.alt = 'Card back';
  img.className = 'card-back-img';
  img.onerror = () => {
    cardEl.innerHTML = '';
    cardEl.classList.add('card-back-fallback');
    cardEl.appendChild(el('div', 'card-back-label', '?'));
  };
  cardEl.appendChild(img);
  return cardEl;
}

function renderCardEl(card) {
  // Unidades usan el nuevo frame con imagen + overlay PNG + texto posicionado.
  if (card.type === 'unit') {
    return renderUnitFrameCard(card);
  }
  // Habilidades siguen usando el render clásico CSS (sin frame).
  return renderSkillCardClassic(card);
}

// Render para cartas de unidad: imagen de fondo + frame.png encima + texto absolute-positioned
// según las coordenadas del frame (1347×1973 px).
function renderUnitFrameCard(card) {
  const cardEl = el('div', `card unit unit-frame-card subtype-${card.subtype.toLowerCase()}`);

  // Capa 1: imagen de la unidad (background)
  if (card.image) {
    const unitImg = document.createElement('img');
    unitImg.src = `${card.image}?v=${ASSET_VERSION}`;
    unitImg.alt = card.name;
    unitImg.className = 'unit-bg-img';
    cardEl.appendChild(unitImg);
  }

  // Capa 2: frame PNG encima
  const frameImg = document.createElement('img');
  frameImg.src = `images/frame.png?v=${ASSET_VERSION}`;
  frameImg.alt = '';
  frameImg.className = 'unit-frame-img';
  cardEl.appendChild(frameImg);

  // Capa 3: texto posicionado según las coordenadas del frame
  cardEl.appendChild(el('div', 'frame-name', card.name));
  cardEl.appendChild(el('div', 'frame-fp', String(card.firepower)));
  cardEl.appendChild(el('div', 'frame-ar', String(card.armor)));
  cardEl.appendChild(el('div', 'frame-desc', card.lore || ''));

  return cardEl;
}

function renderSkillCardClassic(card) {
  const cardEl = el('div', `card ${card.type} subtype-${card.subtype.toLowerCase()}`);

  const top = el('div', 'card-top');
  top.appendChild(el('div', 'card-id-name', `#${card.id} ${card.name.toUpperCase()}`));
  cardEl.appendChild(top);

  const img = el('div', 'card-image');
  if (card.image) {
    const imgEl = document.createElement('img');
    imgEl.src = `${card.image}?v=${ASSET_VERSION}`;
    imgEl.alt = card.name;
    imgEl.className = 'card-image-img';
    imgEl.onerror = () => {
      img.innerHTML = '';
      img.appendChild(el('div', 'card-image-label', card.name));
    };
    img.appendChild(imgEl);
  } else {
    img.appendChild(el('div', 'card-image-label', card.name));
  }
  cardEl.appendChild(img);

  const body = el('div', 'card-body');
  body.appendChild(el('div', 'card-subtype', card.subtype));
  body.appendChild(el('div', 'card-desc', card.effect));
  cardEl.appendChild(body);

  return cardEl;
}

function renderLog(g) {
  const logEl = $('combat-log');
  logEl.innerHTML = '';
  const entries = g.combatLog.slice(-50);
  for (const entry of entries) {
    const entryEl = el('div', 'log-entry');
    entryEl.textContent = entry.message;
    logEl.appendChild(entryEl);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function renderActionBar(g) {
  const bar = $('action-bar');
  bar.innerHTML = '';

  // Si todavía no hay seat (no entramos a sala), no mostrar nada
  if (!localSeat) return;

  if (g.phase === 'setup') {
    renderSetupActions(bar, g);
  } else if (g.phase === 'playing') {
    renderPlayingActions(bar, g);
  } else if (g.phase === 'over') {
    showEndGameModal();
  }
}

function renderSetupActions(bar, g) {
  const sid = g.setupState ? g.setupState.currentPlayer : null;
  const status = el('div', 'action-status', `SETUP del Jugador ${sid} — paso: ${g.setupState ? g.setupState.step : '?'}`);
  bar.appendChild(status);

  if (sid !== localSeat) {
    bar.appendChild(el('div', 'action-warn', `Esperando al Jugador ${sid}...`));
    return;
  }

  if (g.setupState.step === 'mulligan_or_confirm') {
    if (game.canDeclareMulligan(sid)) {
      const btn = el('button', 'btn btn-mulligan', 'Declarar Mulligan');
      btn.addEventListener('click', () => doAction(() => game.declareMulligan(sid)));
      bar.appendChild(btn);
    }
    const confirmBtn = el('button', 'btn btn-confirm', 'Confirmar mano');
    confirmBtn.addEventListener('click', () => doAction(() => game.confirmHand(sid)));
    bar.appendChild(confirmBtn);
  } else if (g.setupState.step === 'placing_units') {
    const nextBtn = el('button', 'btn btn-next', 'Continuar a colocar Skill (opcional)');
    nextBtn.addEventListener('click', () => doAction(() => game.proceedToSkillPlacement(sid)));
    bar.appendChild(nextBtn);
  } else if (g.setupState.step === 'placing_skill') {
    const finishBtn = el('button', 'btn btn-confirm', 'Finalizar setup');
    finishBtn.addEventListener('click', () => {
      clearSelection();
      doAction(() => game.finishSetup(sid));
    });
    bar.appendChild(finishBtn);
  }
}

function renderPlayingActions(bar, g) {
  const pid = g.activePlayer;
  const status = el('div', 'action-status', `Turno ${g.turnNumber}/${g.config.maxTurnos} — Jugador activo: ${pid}`);
  bar.appendChild(status);

  if (pid !== localSeat) {
    bar.appendChild(el('div', 'action-warn', `Esperando al Jugador ${pid}...`));
    return;
  }

  if (game.turnState && !game.turnState.drawnThisTurn) {
    if (game.canReplaceSkill(pid) && !game.turnState.isReplacingSkill) {
      const btn = el('button', 'btn btn-replace', 'Reemplazar Skill');
      btn.addEventListener('click', () => doAction(() => game.enterReplaceSkillMode(pid)));
      bar.appendChild(btn);
    }
    if (game.turnState && game.turnState.isReplacingSkill) {
      const btn = el('button', 'btn btn-cancel', 'Cancelar reemplazo');
      btn.addEventListener('click', () => {
        clearSelection();
        doAction(() => game.exitReplaceSkillMode(pid));
      });
      bar.appendChild(btn);
    }
    const drawBtn = el('button', 'btn btn-draw', 'Robar (paso 2)');
    drawBtn.addEventListener('click', () => doAction(() => game.drawPhase(pid)));
    bar.appendChild(drawBtn);
  }

  if (game.needsRefill(pid)) {
    bar.appendChild(el('div', 'action-warn', '⚠ Debes reponer slots vacíos con unidades de tu mano.'));
  }

  const endBtn = el('button', 'btn btn-end-turn', 'Fin de turno');
  if (!game.canEndTurn(pid)) endBtn.disabled = true;
  endBtn.addEventListener('click', performEndTurn);
  bar.appendChild(endBtn);
}

function renderActivePlayerHighlight(g) {
  for (const pid of [1, 2]) {
    const playerEl = $(`player-${pid}`);
    playerEl.classList.toggle('active', g.activePlayer === pid && g.phase === 'playing');
    playerEl.classList.toggle('setup-current', g.setupState && g.setupState.currentPlayer === pid && g.phase === 'setup');
    playerEl.classList.toggle('local-seat', localSeat === pid);
  }
}

// ──────────────────────────────────────────────────────────────────
// Wrapper genérico para acciones: muta game local, render local, persiste a Firebase.
// ──────────────────────────────────────────────────────────────────
async function doAction(fn) {
  if (isAnimating) return;
  try {
    fn();
    render();
    await persistState();
  } catch (e) {
    console.error('Action failed:', e);
  }
}

// ──────────────────────────────────────────────────────────────────
// Click handlers (cartas y slots)
// ──────────────────────────────────────────────────────────────────
function onCardClick(playerId, instanceId) {
  if (isAnimating) return;
  if (localSeat !== playerId) return; // no puedes clickear cartas del rival

  if (selectedCardInstanceId === instanceId && selectedPlayerId === playerId) {
    clearSelection();
    render();
    return;
  }
  selectedCardInstanceId = instanceId;
  selectedPlayerId = playerId;
  render();
}

function onSlotClick(playerId, slotName) {
  if (isAnimating) return;
  if (!selectedCardInstanceId || selectedPlayerId !== playerId) return;
  if (localSeat !== playerId) return;

  const valids = game.validSlotsFor(playerId, selectedCardInstanceId);
  if (valids.includes(slotName)) {
    doAction(() => game.placeCard(playerId, selectedCardInstanceId, slotName));
    clearSelection();
    return;
  }
  if (valids.includes('skill_replace') && slotName === 'skill') {
    doAction(() => game.placeCard(playerId, selectedCardInstanceId, 'skill_replace'));
    clearSelection();
    return;
  }
}

function clearSelection() {
  selectedCardInstanceId = null;
  selectedPlayerId = null;
}

function setupBoardClickHandlers() {
  document.querySelectorAll('.slot').forEach(slotEl => {
    slotEl.addEventListener('click', () => {
      const playerId = parseInt(slotEl.dataset.player, 10);
      const slotName = slotEl.dataset.slot;
      onSlotClick(playerId, slotName);
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// End turn con animación del combat log
// ──────────────────────────────────────────────────────────────────
async function performEndTurn() {
  if (isAnimating) return;
  if (!game.canEndTurn(localSeat)) return;

  isAnimating = true;
  frozenState = snapshot(game);
  render();

  const logLengthBefore = game.combatLog.length;
  game.endTurn();
  const newEntries = game.combatLog.slice(logLengthBefore);

  for (const entry of newEntries) {
    appendAnimatedLogEntry(entry);
    await sleep(600);
  }
  await sleep(300);

  frozenState = null;
  isAnimating = false;
  render();

  // Persistir el state final en Firebase (incluye el log del combate).
  await persistState();

  if (game.phase === 'over') showEndGameModal();
}

function appendAnimatedLogEntry(entry) {
  const logEl = $('combat-log');
  const entryEl = el('div', 'log-entry log-animated', entry.message);
  logEl.appendChild(entryEl);
  logEl.scrollTop = logEl.scrollHeight;
}

// ──────────────────────────────────────────────────────────────────
// End game modal
// ──────────────────────────────────────────────────────────────────
function showEndGameModal() {
  if (!game || !game.gameOver) return;
  const { winner, reason, stats } = game.gameOver;
  let title;
  if (reason === 'life') title = `🏆 Jugador ${winner} gana — vida reducida a 0`;
  else if (reason === 'turnLimit') title = `🏆 Jugador ${winner} gana — más vida tras límite de turnos`;
  else title = `🤝 Empate técnico`;

  $('endgame-title').textContent = title;
  $('endgame-stats').innerHTML = `
    <p>Vida final — Jugador 1: <strong>${stats.finalLife[1]}</strong> · Jugador 2: <strong>${stats.finalLife[2]}</strong></p>
    <p>Turnos completos jugados: <strong>${Math.floor(stats.turnsPlayed)}</strong></p>
  `;
  showModal('endgame-modal');
}
