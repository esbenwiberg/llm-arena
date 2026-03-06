// ===== FIGHTER ROSTER DATA =====
const ROSTER = [
  {
    id: 'opus',
    backend: 'anthropic',
    model: 'claude-opus-4-6',
    name: 'OPUS',
    title: 'GRAND MASTER',
    tier: 'S',
    color: '#9944ff',
    icon: '\u{1F451}',
    style: 'POWER',
  },
  {
    id: 'sonnet',
    backend: 'anthropic',
    model: 'claude-sonnet-4-6',
    name: 'SONNET',
    title: 'THE WARRIOR',
    tier: 'A',
    color: '#3388ff',
    icon: '\u2694\uFE0F',
    style: 'BALANCED',
  },
  {
    id: 'haiku',
    backend: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    name: 'HAIKU',
    title: 'SWIFT SHADOW',
    tier: 'B',
    color: '#33ff88',
    icon: '\u26A1',
    style: 'SPEED',
  },
];

// ===== STATE =====
const state = {
  p1: null,
  p2: null,
  selecting: 1,
  blueprints: [],
  maxRounds: 5,
  maxTokens: 4096,
  timer: null,
  timerStart: 0,
  rounds: [[], []],
  results: [null, null],
  customFighters: [],
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  renderRoster();
  loadBlueprints();
  bindEvents();
});

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ===== ROSTER =====
function getAllFighters() {
  return [...ROSTER, ...state.customFighters];
}

function renderRoster() {
  const grid = document.getElementById('roster');
  grid.innerHTML = '';

  for (const f of getAllFighters()) {
    const card = document.createElement('div');
    card.className = 'roster-card';
    if (state.p1 && state.p1.id === f.id) card.classList.add('selected-p1');
    if (state.p2 && state.p2.id === f.id) card.classList.add('selected-p2');
    card.innerHTML = `
      <span class="card-tier tier-${f.tier}">${f.tier}</span>
      <div class="card-icon">${f.icon}</div>
      <div class="card-name">${f.name}</div>
    `;
    card.addEventListener('click', () => selectFighter(f));
    grid.appendChild(card);
  }

  // Add custom fighter card
  const addCard = document.createElement('div');
  addCard.className = 'roster-card card-add';
  addCard.innerHTML = `
    <div class="card-icon">+</div>
    <div class="card-name">CUSTOM</div>
  `;
  addCard.addEventListener('click', showCustomModelForm);
  grid.appendChild(addCard);
}

function selectFighter(fighter) {
  if (state.selecting === 1) {
    state.p1 = fighter;
    updatePlayerPanel(1, fighter);
    state.selecting = 2;
  } else {
    state.p2 = fighter;
    updatePlayerPanel(2, fighter);
    state.selecting = 1;
  }
  renderRoster();
  updateFightButton();
}

function updatePlayerPanel(player, fighter) {
  const prefix = 'p' + player;
  const portrait = document.getElementById(prefix + '-portrait');
  const name = document.getElementById(prefix + '-name');
  const title = document.getElementById(prefix + '-title');

  portrait.innerHTML = `<div class="portrait-icon" style="--fighter-color: ${fighter.color}">${fighter.icon}</div>`;
  name.textContent = fighter.name;
  title.textContent = fighter.title;
}

function showCustomModelForm() {
  document.getElementById('custom-model-form').classList.remove('hidden');
  document.getElementById('custom-model-input').focus();
}

function hideCustomModelForm() {
  document.getElementById('custom-model-form').classList.add('hidden');
  document.getElementById('custom-model-input').value = '';
}

function addCustomFighter() {
  const input = document.getElementById('custom-model-input');
  const modelName = input.value.trim();
  if (!modelName) return;

  const fighter = {
    id: 'ollama-' + modelName.replace(/[^a-z0-9]/gi, '-'),
    backend: 'ollama',
    model: modelName,
    name: modelName.toUpperCase().split(/[:/.-]/)[0].slice(0, 8),
    title: 'LOCAL CHALLENGER',
    tier: '?',
    color: '#ff8833',
    icon: '\u{1F999}',
    style: 'UNKNOWN',
  };

  state.customFighters.push(fighter);
  hideCustomModelForm();
  renderRoster();
}

// ===== BLUEPRINTS =====
async function loadBlueprints() {
  try {
    const res = await fetch('api/blueprints');
    state.blueprints = await res.json();
  } catch {
    state.blueprints = [];
  }

  const select = document.getElementById('blueprint-select');
  select.innerHTML = '';

  if (state.blueprints.length === 0) {
    select.innerHTML = '<option value="">No blueprints found</option>';
  } else {
    for (const bp of state.blueprints) {
      const opt = document.createElement('option');
      opt.value = bp.file;
      opt.textContent = bp.name;
      select.appendChild(opt);
    }
  }
  updateFightButton();
}

// ===== EVENTS =====
function bindEvents() {
  // Player panel clicks to toggle selection target
  document.querySelector('.p1-panel').addEventListener('click', () => {
    state.selecting = 1;
    document.querySelector('.p1-panel').style.outline = '2px solid var(--p1)';
    document.querySelector('.p2-panel').style.outline = 'none';
  });
  document.querySelector('.p2-panel').addEventListener('click', () => {
    state.selecting = 2;
    document.querySelector('.p2-panel').style.outline = '2px solid var(--p2)';
    document.querySelector('.p1-panel').style.outline = 'none';
  });

  // Custom model form
  document.getElementById('custom-model-add').addEventListener('click', addCustomFighter);
  document.getElementById('custom-model-cancel').addEventListener('click', hideCustomModelForm);
  document.getElementById('custom-model-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomFighter();
    if (e.key === 'Escape') hideCustomModelForm();
  });

  // Blueprint select
  document.getElementById('blueprint-select').addEventListener('change', updateFightButton);

  // Custom task toggle
  document.getElementById('custom-task-check').addEventListener('change', (e) => {
    document.getElementById('custom-task-panel').classList.toggle('hidden', !e.target.checked);
    updateFightButton();
  });

  // Config inputs
  document.getElementById('max-rounds').addEventListener('change', (e) => {
    state.maxRounds = parseInt(e.target.value) || 5;
  });
  document.getElementById('max-tokens').addEventListener('change', (e) => {
    state.maxTokens = parseInt(e.target.value) || 4096;
  });

  // Fight button
  document.getElementById('btn-fight').addEventListener('click', startFight);

  // Rematch button
  document.getElementById('btn-rematch').addEventListener('click', () => {
    state.rounds = [[], []];
    state.results = [null, null];
    state.commentary = '';
    state.verdict = null;
    state.scores = null;
    showScreen('select');
  });
}

function updateFightButton() {
  const btn = document.getElementById('btn-fight');
  const hasBlueprint = !!document.getElementById('blueprint-select').value ||
    document.getElementById('custom-task-check').checked;
  btn.disabled = !(state.p1 && state.p2 && hasBlueprint);
}

// Also call on load after blueprints are fetched
function onBlueprintsLoaded() {
  updateFightButton();
}

// ===== FIGHT =====
async function startFight() {
  const p1Strategy = document.getElementById('p1-strategy').value;
  const p2Strategy = document.getElementById('p2-strategy').value;
  const useCustom = document.getElementById('custom-task-check').checked;

  const body = {
    fighters: [
      { backend: state.p1.backend, model: state.p1.model, strategy: p1Strategy },
      { backend: state.p2.backend, model: state.p2.model, strategy: p2Strategy },
    ],
    maxRounds: state.maxRounds,
    maxTokens: state.maxTokens,
  };

  if (useCustom) {
    body.customTask = {
      task: document.getElementById('custom-task').value,
      testCommand: document.getElementById('custom-test-cmd').value || 'echo "No tests"',
    };
  } else {
    body.blueprintFile = document.getElementById('blueprint-select').value;
  }

  // Show VS splash
  showVsSplash();

  // Wait for splash animation, then start fight
  setTimeout(async () => {
    showScreen('fight');
    initFightScreen();
    await executeFight(body);
  }, 2500);
}

function showVsSplash() {
  // Setup VS portraits
  document.getElementById('vs-p1-portrait').textContent = state.p1.icon;
  document.getElementById('vs-p1-name').textContent = state.p1.name;
  document.getElementById('vs-p1-name').style.color = state.p1.color;
  document.getElementById('vs-p2-portrait').textContent = state.p2.icon;
  document.getElementById('vs-p2-name').textContent = state.p2.name;
  document.getElementById('vs-p2-name').style.color = state.p2.color;
  showScreen('vs');
}

function initFightScreen() {
  // HUD
  document.getElementById('hud-p1-name').textContent = state.p1.name;
  document.getElementById('hud-p2-name').textContent = state.p2.name;
  document.getElementById('hp-p1').style.width = '100%';
  document.getElementById('hp-p2').style.width = '100%';
  document.getElementById('hud-p1-stats').textContent = 'WAITING';
  document.getElementById('hud-p2-stats').textContent = 'WAITING';
  document.getElementById('hud-round').textContent = 'READY';

  // Sprites
  document.getElementById('sprite-p1-icon').textContent = state.p1.icon;
  document.getElementById('sprite-p1-label').textContent = state.p1.name;
  document.getElementById('sprite-p1').style.setProperty('--fighter-color', state.p1.color);
  document.getElementById('sprite-p2-icon').textContent = state.p2.icon;
  document.getElementById('sprite-p2-label').textContent = state.p2.name;
  document.getElementById('sprite-p2').style.setProperty('--fighter-color', state.p2.color);

  // Add idle animation
  document.getElementById('sprite-p1').classList.add('sprite-idle');
  document.getElementById('sprite-p2').classList.add('sprite-idle');

  // Clear combat log
  const log = document.getElementById('combat-log');
  log.innerHTML = '';

  // Start timer
  state.timerStart = Date.now();
  state.timer = setInterval(updateTimer, 1000);
  state.rounds = [[], []];
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - state.timerStart) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  document.getElementById('hud-timer').textContent =
    mins + ':' + secs.toString().padStart(2, '0');
}

async function executeFight(body) {
  try {
    const response = await fetch('api/fight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            handleFightEvent(currentEvent, data);
          } catch { /* ignore parse errors */ }
        }
      }
    }
  } catch (err) {
    addLogEntry('CONNECTION ERROR: ' + err.message, 'log-error');
  }

  clearInterval(state.timer);
}

// ===== FIGHT EVENT HANDLERS =====
function handleFightEvent(event, data) {
  switch (event) {
    case 'fight-start':
      showFightAction('FIGHT!');
      addLogEntry('FIGHT START - ' + data.blueprint, 'log-system');
      break;

    case 'fighter-enter': {
      const pIdx = data.index;
      const name = pIdx === 0 ? state.p1.name : state.p2.name;
      const spriteId = pIdx === 0 ? 'sprite-p1' : 'sprite-p2';

      addLogEntry(name + ' enters the arena!', pIdx === 0 ? 'log-p1' : 'log-p2');

      // Activate sprite
      const sprite = document.getElementById(spriteId);
      sprite.classList.remove('sprite-idle');
      sprite.classList.add('sprite-active');
      document.getElementById('hud-' + (pIdx === 0 ? 'p1' : 'p2') + '-stats').textContent = 'FIGHTING';
      break;
    }

    case 'round': {
      const pIdx = data.index;
      const round = data.round;
      const prefix = pIdx === 0 ? 'p1' : 'p2';
      const name = pIdx === 0 ? state.p1.name : state.p2.name;
      const spriteId = pIdx === 0 ? 'sprite-p1' : 'sprite-p2';

      state.rounds[pIdx].push(round);

      // Update HUD
      document.getElementById('hud-round').textContent = 'ROUND ' + round.round;
      const tokens = round.tokensUsed.input + round.tokensUsed.output;
      const totalTokens = state.rounds[pIdx].reduce(
        (sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0
      );
      document.getElementById('hud-' + prefix + '-stats').textContent =
        'R' + round.round + ' | ' + totalTokens.toLocaleString() + ' tok';

      // Health bar (depletes per round used)
      const healthPct = Math.max(0, 100 - (round.round / state.maxRounds) * 100);
      document.getElementById('hp-' + prefix).style.width = healthPct + '%';

      // Sprite animation
      const sprite = document.getElementById(spriteId);
      sprite.classList.remove('sprite-attack', 'sprite-hit');
      void sprite.offsetWidth; // force reflow
      sprite.classList.add('sprite-attack');
      setTimeout(() => sprite.classList.remove('sprite-attack'), 400);

      // Log entry
      const status = round.testsPassed ? 'PASS' : 'FAIL';
      const logClass = round.testsPassed ? 'log-pass' : 'log-fail';
      addLogEntry(
        name + ' R' + round.round + ' [' + round.phase + '] - ' + status +
        ' (' + tokens.toLocaleString() + ' tokens)',
        logClass
      );

      if (round.testsPassed) {
        showFightAction('HIT!');
        // Restore health on pass
        document.getElementById('hp-' + prefix).style.width = '100%';
      } else {
        showFightAction('MISS!');
      }
      break;
    }

    case 'fighter-done': {
      const pIdx = data.index;
      const result = data.result;
      const prefix = pIdx === 0 ? 'p1' : 'p2';
      const name = pIdx === 0 ? state.p1.name : state.p2.name;
      const spriteId = pIdx === 0 ? 'sprite-p1' : 'sprite-p2';

      state.results[pIdx] = result;

      const sprite = document.getElementById(spriteId);
      sprite.classList.remove('sprite-active', 'sprite-attack');

      if (result.testsPassed) {
        sprite.classList.add('sprite-idle');
        document.getElementById('hp-' + prefix).style.width = '100%';
        addLogEntry(name + ' - TESTS PASSED!', 'log-pass');
      } else {
        document.getElementById('hp-' + prefix).style.width = '0%';
        addLogEntry(name + ' - TESTS FAILED', 'log-fail');
      }

      document.getElementById('hud-' + prefix + '-stats').textContent =
        (result.testsPassed ? 'PASS' : 'FAIL') + ' | ' +
        (result.totalTokens.input + result.totalTokens.output).toLocaleString() + ' tok | ' +
        formatDuration(result.duration);
      break;
    }

    case 'fighter-error': {
      const pIdx = data.index;
      const name = pIdx === 0 ? state.p1.name : state.p2.name;
      addLogEntry(name + ' ERROR: ' + data.error, 'log-error');
      const prefix = pIdx === 0 ? 'p1' : 'p2';
      document.getElementById('hp-' + prefix).style.width = '0%';
      document.getElementById('hud-' + prefix + '-stats').textContent = 'ERROR';
      break;
    }

    case 'error':
      addLogEntry('ERROR: ' + data.message, 'log-error');
      break;

    case 'judging':
      addLogEntry('OPUS JUDGE is reviewing the code...', 'log-system');
      break;

    case 'judge-verdict':
      state.verdict = data;
      break;

    case 'fight-over':
      if (data.commentary) state.commentary = data.commentary;
      if (data.scores) state.scores = data.scores;
      onFightOver(data);
      break;
  }
}

function onFightOver(data) {
  clearInterval(state.timer);
  const { results, winner } = data;

  // Animate sprites for outcome
  if (winner) {
    const winSprite = winner.index === 0 ? 'sprite-p1' : 'sprite-p2';
    const loseSprite = winner.index === 0 ? 'sprite-p2' : 'sprite-p1';
    document.getElementById(winSprite).className = 'fighter-sprite ' +
      (winner.index === 0 ? 'sprite-left' : 'sprite-right') + ' sprite-win';
    document.getElementById(loseSprite).className = 'fighter-sprite ' +
      (winner.index === 0 ? 'sprite-right' : 'sprite-left') + ' sprite-lose';
    showFightAction('K.O.!');
  } else {
    showFightAction('DRAW!');
  }

  addLogEntry('FIGHT OVER', 'log-system');

  // Transition to judge screen after a delay
  setTimeout(() => renderJudge(results, winner), 2500);
}

// ===== JUDGE SCREEN =====
function renderJudge(results, winner) {
  showScreen('judge');

  const banner = document.getElementById('judge-banner');
  if (winner) {
    const winName = winner.index === 0 ? state.p1.name : state.p2.name;
    // Check if winner passed in round 1 (perfect)
    const winResult = results[winner.index];
    if (winResult && winResult.rounds.length === 1 && winResult.testsPassed) {
      banner.className = 'judge-banner perfect';
      banner.textContent = 'PERFECT!';
    } else {
      banner.className = 'judge-banner ko';
      banner.textContent = 'K.O.!';
    }
  } else {
    banner.className = 'judge-banner draw';
    banner.textContent = 'DRAW';
  }

  // Fighter panels
  setupJudgeFighter('judge-p1', state.p1, results[0], winner?.index === 0, winner?.index === 1);
  setupJudgeFighter('judge-p2', state.p2, results[1], winner?.index === 1, winner?.index === 0);

  // Reason
  // reason is shown in commentary section now

  // Scorecard
  const r0 = results[0] || {};
  const r1 = results[1] || {};
  document.getElementById('sc-p1-name').textContent = state.p1.name;
  document.getElementById('sc-p2-name').textContent = state.p2.name;

  const tbody = document.getElementById('scorecard-body');
  tbody.innerHTML = '';

  const scores = state.scores || ['-', '-'];
  const rows = [
    ['RESULT', resultText(r0), resultText(r1), r0.testsPassed, r1.testsPassed],
    ['JUDGE SCORE', scores[0] + '/10', scores[1] + '/10'],
    ['STRATEGY', r0.strategy || '-', r1.strategy || '-'],
    ['ROUNDS', (r0.rounds || []).length, (r1.rounds || []).length],
    ['TOKENS (IN)', (r0.totalTokens?.input || 0).toLocaleString(), (r1.totalTokens?.input || 0).toLocaleString()],
    ['TOKENS (OUT)', (r0.totalTokens?.output || 0).toLocaleString(), (r1.totalTokens?.output || 0).toLocaleString()],
    ['TOTAL TOKENS',
      ((r0.totalTokens?.input || 0) + (r0.totalTokens?.output || 0)).toLocaleString(),
      ((r1.totalTokens?.input || 0) + (r1.totalTokens?.output || 0)).toLocaleString()
    ],
    ['TIME', formatDuration(r0.duration || 0), formatDuration(r1.duration || 0)],
  ];

  for (const row of rows) {
    const tr = document.createElement('tr');
    const [label, v1, v2, pass1, pass2] = row;
    tr.innerHTML = `
      <td>${label}</td>
      <td class="${pass1 === true ? 'stat-pass' : pass1 === false ? 'stat-fail' : ''}
                  ${winner?.index === 0 && label === 'RESULT' ? 'stat-winner' : ''}">${v1}</td>
      <td class="${pass2 === true ? 'stat-pass' : pass2 === false ? 'stat-fail' : ''}
                  ${winner?.index === 1 && label === 'RESULT' ? 'stat-winner' : ''}">${v2}</td>
    `;
    tbody.appendChild(tr);
  }

  // Show judge commentary
  const commentaryEl = document.getElementById('judge-commentary');
  const reason = winner?.reason || '';
  const commentary = state.commentary || '';
  commentaryEl.textContent = [reason, commentary].filter(Boolean).join(' — ');
}

function setupJudgeFighter(elementId, fighter, result, isWinner, isLoser) {
  const el = document.getElementById(elementId);
  el.className = 'judge-fighter' + (isWinner ? ' winner' : '') + (isLoser ? ' loser' : '');

  document.getElementById(elementId + '-portrait').textContent = fighter.icon;
  document.getElementById(elementId + '-portrait').style.setProperty('--fighter-color', fighter.color);
  document.getElementById(elementId + '-name').textContent = fighter.name;
  document.getElementById(elementId + '-name').style.color = fighter.color;

  const verdict = document.getElementById(elementId + '-verdict');
  if (isWinner) {
    verdict.textContent = 'WINNER';
    verdict.style.color = '#f0c020';
  } else if (isLoser) {
    verdict.textContent = 'DEFEATED';
    verdict.style.color = '#ff3333';
  } else {
    verdict.textContent = 'DRAW';
    verdict.style.color = '#888';
  }
}

// ===== FIGHT UI HELPERS =====
function showFightAction(text) {
  const el = document.getElementById('fight-action');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function addLogEntry(text, className) {
  const log = document.getElementById('combat-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + (className || '');
  entry.textContent = '> ' + text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ===== UTILITIES =====
function resultText(r) {
  if (!r || !r.id) return '-';
  if (r.id === 'error') return 'ERROR';
  return r.testsPassed ? 'PASS' : 'FAIL';
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return minutes + 'm ' + rem + 's';
}
