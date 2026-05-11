// ============================================================
// AUX BATTLES — app.js v2
// New features: inline YouTube/Spotify player, confetti,
//               scoreboard progress bars, round timer
// ============================================================

const THEMES = [
  // Classic vibes
  'Sunset on the beach 🌅', 'Late night drive 🚗', 'First heartbreak 💔',
  'Summer party 🎉', 'Main character moment ✨', 'Rainy day ☔',
  'Gym motivation 💪', 'Road trip with friends 🛣️', 'Villain arc 😈',
  'Falling in love 💕', 'Final boss fight 🎮', 'Morning coffee routine ☕',
  'Dancing alone in your room 🕺', 'Nostalgic childhood memories 🎠',
  'End of summer feels 🍂', 'Revenge era 🔥', 'Midnight thoughts 🌙',
  'Best friend vibes 👯', 'Running away from problems 🏃', 'Winning moment 🏆',
  'Pre-game hype 🏟️', 'Heartbreak hotel 🏨', 'Driving into the sunset 🌇',
  'Feeling unstoppable 💥', 'Sad girl/boy hours 🌧️',
  // Underground / niche
  'Underground artist nobody knows yet 🕳️', '3am and can\'t sleep 🛌',
  'Driving through the city alone at night 🌆', 'That one song that hits different 🎧',
  'When you\'re in your feels fr 😶', 'Song for a broken situationship 💀',
  'Nettspend/Osamason type beat 🌫️', 'That low-fi plug nobody told you about 📻',
  'Alt girl/boy playlist 🖤', 'Basement show energy 🎸',
  'Song you\'d put on a burner phone playlist 📱', 'Outro track energy 🌃',
  'The song you play when nobody\'s watching 👁️', 'SoundCloud era banger 💿',
  'Heartbreak but make it drill 🔫', 'Song that lives in your head rent free 🧠',
  'Hidden gem — under 1k streams 💎', 'When the aux gets passed to the right person 🎵',
  'Sad banger (it goes hard but you\'re crying) 😭🔥', 'Outro for when summer ends 🌙',
];

// ── State ────────────────────────────────────────────────────
const S = {
  db: null, channel: null,
  playerId: null, roomId: null, roomCode: null, nickname: null, isHost: false,
  room: null, players: [], submissions: [], votes: [],
  mySubmissionId: null, hasVoted: false, votingOrder: [],
  roundStartTime: null,
};

let _timerInterval  = null;
let _confettiFired  = false;
let _audioCtx       = null;   // Web Audio API context for SFX
const ROUND_SECONDS = 60;     // Countdown duration for song submission

// ── Startup ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  S.db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  bindUI();
  initMusicPlayer();
  clearSession();         // Always start on home screen
  loadLeaderboard();
  // Show player widget on home screen too
  get('music-player')?.classList.remove('hidden');
});

function bindUI() {
  on('create-room-btn',  'click', createRoom);
  on('join-room-btn',    'click', joinRoom);
  on('room-code-input',  'keypress', e => e.key === 'Enter' && joinRoom());
  on('nickname-input',   'keypress', e => e.key === 'Enter' && createRoom());
  on('start-game-btn',   'click', startGame);
  on('leave-room-btn',   'click', leaveRoom);
  on('copy-code-btn',    'click', copyCode);
  on('submit-song-btn',  'click', submitSong);
  on('next-round-btn',   'click', nextRound);
  on('end-game-btn',     'click', endGame);
  on('play-again-btn',   'click', () => location.reload());
  on('refresh-lb-btn',   'click', loadLeaderboard);
  on('mp-play-btn',      'click', toggleLobbyMusic);
  on('mp-vol-icon',      'click', toggleMute);
  on('mp-volume',        'input', e => setVolume(parseFloat(e.target.value)));
}

// ── Session ───────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem('aux_session', JSON.stringify({
    playerId: S.playerId, roomId: S.roomId,
    roomCode: S.roomCode, nickname: S.nickname, isHost: S.isHost,
  }));
}
function clearSession() { localStorage.removeItem('aux_session'); }

async function resumeSession(saved) {
  showLoading('Resuming session…');
  try {
    const { data: player } = await S.db
      .from('players').select('*, rooms(*)')
      .eq('id', saved.playerId).eq('is_active', true).maybeSingle();

    if (!player?.rooms) { clearSession(); hideLoading(); return; }

    S.playerId = player.id;    S.roomId   = player.room_id;
    S.roomCode = player.rooms.code; S.nickname = player.nickname;
    S.isHost   = player.is_host;   S.room     = player.rooms;

    saveSession();
    await subscribeRoom();
    await loadAll();
    routeToScreen();
  } catch (_) { clearSession(); }
  hideLoading();
}

// ── Create / Join ─────────────────────────────────────────────
async function createRoom() {
  const nick = get('nickname-input').value.trim();
  if (!validNick(nick)) return;
  showLoading('Creating room…');
  try {
    const code = genCode();
    const { data: room, error: re } = await S.db
      .from('rooms').insert({ code, status: 'lobby', current_round: 0, max_score: 5 })
      .select().single();
    if (re) throw re;

    const { data: player, error: pe } = await S.db
      .from('players').insert({ room_id: room.id, nickname: nick, is_host: true, score: 0 })
      .select().single();
    if (pe) throw pe;

    await S.db.from('rooms').update({ host_player_id: player.id }).eq('id', room.id);

    S.playerId = player.id; S.roomId   = room.id;
    S.roomCode = room.code; S.nickname = nick;
    S.isHost   = true;      S.room     = { ...room, host_player_id: player.id };

    saveSession(); await subscribeRoom(); await loadAll(); showScreen('lobby');
  } catch (e) { toast(e.message || 'Failed to create room.', 'error'); }
  hideLoading();
}

async function joinRoom() {
  const nick = get('nickname-input').value.trim();
  const code = get('room-code-input').value.trim().toUpperCase();
  if (!validNick(nick)) return;
  if (code.length < 4) { toast('Enter a valid room code.', 'error'); return; }

  showLoading('Joining room…');
  try {
    const { data: room } = await S.db.from('rooms').select('*').eq('code', code).maybeSingle();
    if (!room)                 { hideLoading(); toast('Room not found.', 'error'); return; }
    if (room.status !== 'lobby') { hideLoading(); toast('Game already started.', 'error'); return; }

    const { data: dup } = await S.db.from('players').select('id')
      .eq('room_id', room.id).eq('nickname', nick).eq('is_active', true);
    if (dup?.length) { hideLoading(); toast('Nickname taken. Try another.', 'error'); return; }

    const { data: player, error: pe } = await S.db
      .from('players').insert({ room_id: room.id, nickname: nick, is_host: false, score: 0 })
      .select().single();
    if (pe) throw pe;

    S.playerId = player.id; S.roomId   = room.id;
    S.roomCode = room.code; S.nickname = nick;
    S.isHost   = false;     S.room     = room;

    saveSession(); await subscribeRoom(); await loadAll(); showScreen('lobby');
  } catch (e) { toast(e.message || 'Failed to join.', 'error'); }
  hideLoading();
}

// ── Realtime ──────────────────────────────────────────────────
async function subscribeRoom() {
  if (S.channel) await S.db.removeChannel(S.channel);

  S.channel = S.db.channel(`room-${S.roomId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${S.roomId}` },
      async payload => { S.room = payload.new; await loadAll(); routeToScreen(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${S.roomId}` },
      async () => { await loadAll(); renderScreen(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions', filter: `room_id=eq.${S.roomId}` },
      async () => { await loadSubmissions(); renderScreen(); await checkAllSubmitted(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${S.roomId}` },
      async () => { await loadVotes(); renderScreen(); await checkAllVoted(); })
    .subscribe();
}

// ── Data loading ──────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadRoom(), loadPlayers()]);
  await Promise.all([loadSubmissions(), loadVotes()]);
}

async function loadRoom() {
  const { data } = await S.db.from('rooms').select('*').eq('id', S.roomId).single();
  if (data) S.room = data;
}

async function loadPlayers() {
  const prevCount = S.players.length;
  const { data } = await S.db.from('players').select('*')
    .eq('room_id', S.roomId).eq('is_active', true).order('created_at');
  if (data) {
    // Play join sound when a new player appears in the lobby
    if (data.length > prevCount && S.room?.status === 'lobby') sfx('join');
    S.players = data;
    const me = data.find(p => p.id === S.playerId);
    if (me) { S.isHost = me.is_host; saveSession(); }
  }
}

async function loadSubmissions() {
  if (!S.room || S.room.current_round === 0) { S.submissions = []; return; }
  const { data } = await S.db.from('submissions').select('*')
    .eq('room_id', S.roomId).eq('round', S.room.current_round);
  if (data) {
    S.submissions    = data;
    S.mySubmissionId = data.find(s => s.player_id === S.playerId)?.id ?? null;
  }
}

async function loadVotes() {
  if (!S.room || S.room.current_round === 0) { S.votes = []; return; }
  const { data } = await S.db.from('votes').select('*')
    .eq('room_id', S.roomId).eq('round', S.room.current_round);
  if (data) {
    S.votes    = data;
    S.hasVoted = data.some(v => v.voter_id === S.playerId);
  }
}

// ── Game actions ──────────────────────────────────────────────
async function startGame() {
  if (!S.isHost) return;
  if (S.players.length < 2) { toast('Need at least 2 players!', 'error'); return; }
  showLoading('Starting game…');
  await S.db.from('rooms').update({ status: 'submitting', current_round: 1, current_theme: pickTheme() }).eq('id', S.roomId);
  hideLoading();
}

async function nextRound() {
  if (!S.isHost) return;
  const top = Math.max(...S.players.map(p => p.score));
  if (top >= (S.room.max_score || 5)) { await endGame(); return; }
  showLoading('Next round…');
  S.mySubmissionId = null; S.hasVoted = false; S.votingOrder = []; _confettiFired = false;
  await S.db.from('rooms').update({
    status: 'submitting',
    current_round: S.room.current_round + 1,
    current_theme: pickTheme(S.room.current_theme),
  }).eq('id', S.roomId);
  hideLoading();
}

async function endGame() {
  if (!S.isHost) return;
  await S.db.from('rooms').update({ status: 'ended' }).eq('id', S.roomId);
}

async function submitSong() {
  const title  = get('song-title').value.trim();
  const artist = get('song-artist').value.trim();
  const link   = get('song-link').value.trim();

  if (!title)  { toast('Enter a song title.', 'error'); return; }
  if (!artist) { toast('Enter an artist name.', 'error'); return; }
  if (link && !isValidUrl(link)) { toast('Link must start with https://', 'error'); return; }

  showLoading('Submitting…');
  const { data, error } = await S.db.from('submissions').insert({
    room_id: S.roomId, player_id: S.playerId,
    round: S.room.current_round, song_title: title, artist, link: link || null,
  }).select().single();
  hideLoading();

  if (error) { toast('Submission failed.', 'error'); return; }
  S.mySubmissionId = data.id;
  sfx('submit');
  get('submission-form').classList.add('hidden');
  get('submitted-waiting').classList.remove('hidden');
  await loadSubmissions();
  await checkAllSubmitted();
  renderScreen();
}

async function checkAllSubmitted() {
  if (!S.isHost) return;
  const active = S.players.filter(p => p.is_active);
  if (S.submissions.length >= active.length && active.length > 0)
    await S.db.from('rooms').update({ status: 'voting' }).eq('id', S.roomId);
}

// Called from onclick in song card HTML — must be global
async function castVote(submissionId) {
  if (S.hasVoted) return;
  showLoading('Casting vote…');
  const { error } = await S.db.from('votes').insert({
    room_id: S.roomId, voter_id: S.playerId,
    submission_id: submissionId, round: S.room.current_round,
  });
  hideLoading();
  if (error) { toast('Vote failed.', 'error'); return; }
  S.hasVoted = true;
  sfx('vote');
  get('songs-grid').classList.add('hidden');
  get('vote-submitted').classList.remove('hidden');
  await loadVotes();
  await checkAllVoted();
  renderScreen();
}

async function checkAllVoted() {
  if (!S.isHost) return;
  const active = S.players.filter(p => p.is_active);
  if (S.votes.length >= active.length && active.length > 0)
    await tallyAndShowResults();
}

async function tallyAndShowResults() {
  const counts = {};
  S.votes.forEach(v => { counts[v.submission_id] = (counts[v.submission_id] || 0) + 1; });
  const maxVotes  = Math.max(0, ...Object.values(counts));
  if (maxVotes > 0) {
    const winnerIds = Object.keys(counts).filter(id => counts[id] === maxVotes);
    if (winnerIds.length === 1) {
      const w = S.submissions.find(s => s.id === winnerIds[0]);
      if (w) {
        const wp = S.players.find(p => p.id === w.player_id);
        if (wp) await S.db.from('players').update({ score: wp.score + 1 }).eq('id', wp.id);
      }
    }
  }
  await S.db.from('rooms').update({ status: 'results' }).eq('id', S.roomId);
}

async function leaveRoom() {
  if (!confirm('Leave the room?')) return;
  showLoading('Leaving…');
  await S.db.from('players').update({ is_active: false }).eq('id', S.playerId);
  if (S.isHost) {
    const others = S.players.filter(p => p.id !== S.playerId && p.is_active);
    if (others.length > 0) {
      await S.db.from('players').update({ is_host: true }).eq('id', others[0].id);
      await S.db.from('rooms').update({ host_player_id: others[0].id }).eq('id', S.roomId);
    } else {
      await S.db.from('rooms').update({ status: 'ended' }).eq('id', S.roomId);
    }
  }
  if (S.channel) await S.db.removeChannel(S.channel);
  clearSession(); location.reload();
}

function copyCode() {
  navigator.clipboard.writeText(S.roomCode).then(() => {
    const btn = get('copy-code-btn');
    btn.textContent = '✅';
    toast('Room code copied!', 'success');
    setTimeout(() => { btn.textContent = '📋'; }, 2000);
  });
}

// ── Countdown timer ───────────────────────────────────────────
function startTimer() {
  S.roundStartTime = Date.now();
  clearInterval(_timerInterval);

  const el = get('round-timer');
  if (el) { el.textContent = `${Math.floor(ROUND_SECONDS/60)}:${String(ROUND_SECONDS%60).padStart(2,'0')}`; el.classList.remove('danger'); }

  _timerInterval = setInterval(async () => {
    const elapsed   = Math.floor((Date.now() - S.roundStartTime) / 1000);
    const remaining = ROUND_SECONDS - elapsed;
    const timerEl   = get('round-timer');

    if (remaining <= 0) {
      clearInterval(_timerInterval);
      if (timerEl) { timerEl.textContent = '0:00'; timerEl.classList.add('danger'); }
      // Host auto-advances to voting when time runs out
      if (S.isHost && S.room?.status === 'submitting') {
        await S.db.from('rooms').update({ status: 'voting' }).eq('id', S.roomId);
      }
      return;
    }

    if (timerEl) {
      timerEl.textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
      if (remaining <= 10) {
        timerEl.classList.add('danger');
        sfx('tick');                         // tick every second in last 10s
      } else {
        timerEl.classList.remove('danger');
      }
    }
  }, 1000);
}

function stopTimer() { clearInterval(_timerInterval); }

// ── Sound effects (Web Audio API — no external files) ─────────
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// Play a single tone
function tone(freq, dur, type = 'sine', vol = 0.25) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch (_) {}
}

// Named sound effects
function sfx(type) {
  switch (type) {
    case 'start':   // ascending fanfare — game begins
      tone(392, 0.12); setTimeout(() => tone(523, 0.12), 130); setTimeout(() => tone(659, 0.3), 260); break;
    case 'submit':  // positive double-beep — song submitted
      tone(523, 0.1); setTimeout(() => tone(659, 0.15), 110); break;
    case 'vote':    // single mid beep — vote cast
      tone(440, 0.18, 'sine', 0.2); break;
    case 'win':     // victory jingle — you won the round
      tone(523, 0.09); setTimeout(() => tone(659, 0.09), 100);
      setTimeout(() => tone(784, 0.09), 200); setTimeout(() => tone(1047, 0.35), 300); break;
    case 'lose':    // descending — someone else won
      tone(400, 0.18); setTimeout(() => tone(330, 0.18), 190); setTimeout(() => tone(262, 0.35), 380); break;
    case 'tick':    // quiet click — last 10 seconds
      tone(880, 0.04, 'square', 0.08); break;
    case 'join':    // soft ding — new player joined
      tone(587, 0.15, 'sine', 0.15); break;
    case 'end':     // final victory chord
      tone(523, 0.5); tone(659, 0.5); tone(784, 0.5); tone(1047, 0.7); break;
  }
}

// ── Lobby music player ────────────────────────────────────────
let _lobbyMusicPlaying = false;
let _muted             = false;
let _lastVolume        = 0.4;
let _userPaused        = false;  // true if user explicitly stopped music

function initMusicPlayer() {
  const audio = get('lobby-audio');
  if (!audio) return;
  audio.volume = _lastVolume;
}

// Show or hide the player widget based on current screen
function updatePlayerVisibility(screenName) {
  const player = get('music-player');
  if (!player) return;
  if (screenName === 'lobby') {
    player.classList.remove('hidden');
    if (!_userPaused) playLobbyMusic();  // autoplay only if user hasn't manually stopped
  } else {
    player.classList.remove('hidden'); // keep visible so user can control
  }
}

function playLobbyMusic() {
  const audio = get('lobby-audio');
  if (!audio) return;
  const promise = audio.play();
  if (promise !== undefined) {
    promise.then(() => { _lobbyMusicPlaying = true; updatePlayerUI(); })
           .catch(() => { _lobbyMusicPlaying = false; updatePlayerUI(); }); // autoplay blocked
  }
}

function pauseLobbyMusic(byUser = false) {
  const audio = get('lobby-audio');
  if (!audio) return;
  audio.pause();
  _lobbyMusicPlaying = false;
  if (byUser) _userPaused = true;
  updatePlayerUI();
}

function toggleLobbyMusic() {
  if (_lobbyMusicPlaying) {
    pauseLobbyMusic(true);
  } else {
    _userPaused = false;
    playLobbyMusic();
  }
}

function setVolume(val) {
  const audio = get('lobby-audio');
  if (!audio) return;
  _lastVolume = val;
  audio.volume = val;
  _muted = val === 0;
  updateVolIcon(val);
}

function toggleMute() {
  const audio = get('lobby-audio');
  const slider = get('mp-volume');
  if (!audio || !slider) return;
  if (_muted) {
    audio.volume = _lastVolume || 0.4;
    slider.value = audio.volume;
    _muted = false;
  } else {
    _lastVolume = audio.volume;
    audio.volume = 0;
    slider.value = 0;
    _muted = true;
  }
  updateVolIcon(audio.volume);
}

function updateVolIcon(vol) {
  const icon = get('mp-vol-icon');
  if (!icon) return;
  icon.textContent = vol === 0 ? '🔇' : vol < 0.4 ? '🔉' : '🔊';
}

function updatePlayerUI() {
  const btn  = get('mp-play-btn');
  const bars = get('mp-bars');
  if (btn)  btn.textContent = _lobbyMusicPlaying ? '⏸' : '▶';
  if (bars) bars.classList.toggle('playing', _lobbyMusicPlaying);
}

// ── Embed parser ──────────────────────────────────────────────
// Converts YouTube / Spotify URLs into embeddable iframe URLs
function getEmbedInfo(url) {
  if (!url) return null;
  try {
    const u = new URL(url);

    // YouTube — handles youtube.com/watch, youtu.be, youtube.com/shorts, music.youtube.com
    const ytMatch =
      url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/) ;
    if (ytMatch) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0` };

    // Spotify — handles track, album, playlist, episode
    if (u.hostname === 'open.spotify.com') {
      const clean = u.pathname.replace(/\/(track|album|playlist|episode)\//, '/embed/$1/');
      return { type: 'spotify', embedUrl: `https://open.spotify.com${clean}?theme=0` };
    }
  } catch (_) {}
  return null;
}

// Toggle embed iframe open/closed — called from onclick in card HTML
function toggleEmbed(id) {
  const wrap = document.getElementById(`embed-${id}`);
  const btn  = document.getElementById(`playbtn-${id}`);
  if (!wrap || !btn) return;

  const opening = wrap.classList.contains('hidden');
  wrap.classList.toggle('hidden');

  if (opening) {
    btn.classList.add('playing');
    btn.innerHTML = '⏹ Close Player';
  } else {
    btn.classList.remove('playing');
    // Clear iframe src to stop playback
    const iframe = wrap.querySelector('iframe');
    if (iframe) { const src = iframe.src; iframe.src = ''; iframe.src = src; }
    btn.innerHTML = wrap.dataset.type === 'youtube' ? '▶ Play on YouTube' : '▶ Play on Spotify';
  }
}

// Build a song card HTML string (used in voting and results)
function songCardHtml(sub, { showVoteBtn = false, voteCount = null, isWinner = false } = {}) {
  const isMine  = sub.id === S.mySubmissionId;
  const byName  = S.players.find(p => p.id === sub.player_id)?.nickname || '?';
  const embed   = getEmbedInfo(sub.link);

  const embedHtml = embed ? `
    <button class="btn-play" id="playbtn-${sub.id}" onclick="toggleEmbed('${sub.id}')">
      ${embed.type === 'youtube' ? '▶ Play on YouTube' : '▶ Play on Spotify'}
    </button>
    <div class="embed-wrap ${embed.type === 'youtube' ? 'yt' : 'sp'} hidden"
         id="embed-${sub.id}" data-type="${embed.type}">
      <iframe
        src="${esc(embed.embedUrl)}"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen loading="lazy">
      </iframe>
    </div>` : (sub.link ? `<a href="${esc(sub.link)}" target="_blank" rel="noopener" class="btn-play">🔗 Open Link</a>` : '');

  const voteHtml = showVoteBtn
    ? (isMine
        ? '<span class="your-song-label">✦ Your Song</span>'
        : `<button class="btn btn-primary vote-btn" onclick="castVote('${sub.id}')">👍 Vote</button>`)
    : '';

  const voteBadge = voteCount !== null
    ? `<span style="font-size:0.8rem;color:var(--accent);font-weight:700;">${voteCount} vote${voteCount !== 1 ? 's' : ''}</span>`
    : '';

  return `
    <div class="song-card${isWinner ? ' song-card-winner' : ''}" id="card-${sub.id}">
      <div class="song-card-top">
        <div class="song-icon">🎵</div>
        <div class="song-info">
          <div class="song-title">${esc(sub.song_title)}</div>
          <div class="song-artist">by ${esc(sub.artist)}</div>
          <div class="song-submitter">submitted by ${esc(byName)}</div>
        </div>
      </div>
      ${embedHtml}
      <div class="song-actions" style="margin-top:12px;">
        ${voteHtml}
        ${voteBadge}
      </div>
    </div>`;
}

// ── Screen routing ────────────────────────────────────────────
function routeToScreen() {
  if (!S.room) return;
  const map = { lobby:'lobby', submitting:'game', voting:'voting', results:'results', ended:'endgame' };
  const target = map[S.room.status];
  if (target) showScreen(target);
}

function showScreen(name) {
  if (name !== 'game') stopTimer();
  if (name === 'game')    { S.mySubmissionId = null; S.hasVoted = false; S.votingOrder = []; _confettiFired = false; sfx('start'); }
  if (name === 'results') { _confettiFired = false; }
  if (name !== 'lobby')   { pauseLobbyMusic(); }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  get(`screen-${name}`).classList.add('active');
  updatePlayerVisibility(name);
  renderScreen();
}

function renderScreen() {
  const el = document.querySelector('.screen.active');
  if (!el) return;
  ({ 'screen-lobby': renderLobby, 'screen-game': renderGame,
     'screen-voting': renderVoting, 'screen-results': renderResults,
     'screen-endgame': renderEndGame }[el.id] || (() => {}))();
}

// ── Renderers ─────────────────────────────────────────────────
function renderLobby() {
  get('lobby-room-code').textContent = S.roomCode;
  get('player-count').textContent    = S.players.length;
  get('players-list').innerHTML = S.players.map(p => `
    <div class="player-item">
      <div class="player-avatar">${esc(p.nickname[0].toUpperCase())}</div>
      <div class="player-name">${esc(p.nickname)}</div>
      ${p.is_host ? '<span class="host-badge">Host</span>' : ''}
      ${p.id === S.playerId ? '<span class="you-badge">You</span>' : ''}
    </div>`).join('');

  const startBtn = get('start-game-btn');
  const waitMsg  = get('waiting-host-msg');
  if (S.isHost) {
    startBtn.classList.remove('hidden'); waitMsg.classList.add('hidden');
    const ok = S.players.length >= 2;
    startBtn.disabled    = !ok;
    startBtn.textContent = ok ? '🎵 Start Game' : '⏳ Waiting for players…';
  } else {
    startBtn.classList.add('hidden'); waitMsg.classList.remove('hidden');
  }
}

function renderGame() {
  if (!S.room) return;
  get('current-round').textContent = S.room.current_round;
  get('current-theme').textContent = S.room.current_theme;

  // Start timer only when entering submission phase for the first time
  if (!S.roundStartTime) startTimer();

  if (S.mySubmissionId) {
    get('submission-form').classList.add('hidden');
    get('submitted-waiting').classList.remove('hidden');
    const submitted = new Set(S.submissions.map(s => s.player_id));
    get('submission-progress').innerHTML = S.players.map(p => {
      const done = submitted.has(p.id);
      return `<div class="progress-item ${done ? 'done' : ''}">
        <div class="progress-dot"></div>
        <span>${esc(p.nickname)} ${done ? '✓' : '…'}</span>
      </div>`;
    }).join('');
  } else {
    get('submission-form').classList.remove('hidden');
    get('submitted-waiting').classList.add('hidden');
  }
}

function renderVoting() {
  if (!S.room) return;
  get('voting-round').textContent = S.room.current_round;
  get('voting-theme').textContent = S.room.current_theme;

  if (S.hasVoted) {
    get('songs-grid').classList.add('hidden');
    get('vote-submitted').classList.remove('hidden');
    const voted = new Set(S.votes.map(v => v.voter_id));
    get('vote-progress').innerHTML = S.players.map(p => {
      const done = voted.has(p.id);
      return `<div class="progress-item ${done ? 'done' : ''}">
        <div class="progress-dot"></div>
        <span>${esc(p.nickname)} ${done ? '✓' : '…'}</span>
      </div>`;
    }).join('');
    return;
  }

  get('songs-grid').classList.remove('hidden');
  get('vote-submitted').classList.add('hidden');

  // Stable shuffle order per voting phase
  if (S.votingOrder.length !== S.submissions.length) {
    S.votingOrder = [...S.submissions.map(s => s.id)].sort(() => Math.random() - 0.5);
  }

  const ordered = S.votingOrder.map(id => S.submissions.find(s => s.id === id)).filter(Boolean);
  get('songs-grid').innerHTML = ordered.map(sub => songCardHtml(sub, { showVoteBtn: true })).join('');
}

function renderResults() {
  if (!S.room) return;
  get('results-round').textContent = S.room.current_round;

  const counts = {};
  S.votes.forEach(v => { counts[v.submission_id] = (counts[v.submission_id] || 0) + 1; });

  const sorted   = [...S.submissions].sort((a,b) => (counts[b.id]||0) - (counts[a.id]||0));
  const maxVotes = sorted.length ? (counts[sorted[0].id] || 0) : 0;
  const winners  = sorted.filter(s => (counts[s.id]||0) === maxVotes && maxVotes > 0);

  const winBanner = get('winner-banner');
  const tieBanner = get('tie-banner');

  if (maxVotes === 0) {
    winBanner.classList.add('hidden'); tieBanner.classList.add('hidden');
  } else if (winners.length === 1) {
    const w   = winners[0];
    const wBy = S.players.find(p => p.id === w.player_id)?.nickname || '?';
    get('winner-name').textContent = wBy;
    get('winner-song').textContent = `"${w.song_title}" by ${w.artist}`;
    winBanner.classList.remove('hidden'); tieBanner.classList.add('hidden');
    // 🎊 Confetti + SFX — fire once per results reveal
    if (!_confettiFired) {
      _confettiFired = true;
      fireConfetti();
      // Win SFX if you won, lose SFX if someone else won
      const roundWinner = S.submissions.find(s => s.id === winners[0].id);
      sfx(roundWinner?.player_id === S.playerId ? 'win' : 'lose');
    }
  } else {
    winBanner.classList.add('hidden'); tieBanner.classList.remove('hidden');
  }

  // Song cards with vote counts and embed players
  get('results-list').innerHTML = sorted.map(sub =>
    songCardHtml(sub, { voteCount: counts[sub.id] || 0, isWinner: winners.length === 1 && sub.id === winners[0].id })
  ).join('');

  renderScoreboard('scoreboard');

  const nextBtn = get('next-round-btn');
  const endBtn  = get('end-game-btn');
  const waitMsg = get('results-waiting-msg');
  if (S.isHost) {
    nextBtn.classList.remove('hidden'); endBtn.classList.remove('hidden'); waitMsg.classList.add('hidden');
  } else {
    nextBtn.classList.add('hidden'); endBtn.classList.add('hidden'); waitMsg.classList.remove('hidden');
  }
}

function renderEndGame() {
  const sorted = [...S.players].sort((a,b) => b.score - a.score);
  const champ  = sorted[0];
  if (champ) {
    get('champion-name').textContent  = champ.nickname;
    get('champion-score').textContent = `${champ.score} point${champ.score !== 1 ? 's' : ''}`;
  }
  renderScoreboard('final-scoreboard');
  setTimeout(() => { fireConfetti(true); sfx('end'); }, 300);
}

function renderScoreboard(id) {
  const sorted   = [...S.players].sort((a,b) => b.score - a.score);
  const maxScore = S.room?.max_score || 5;
  const medals   = ['🥇','🥈','🥉'];
  get(id).innerHTML = sorted.map((p,i) => {
    const pct = Math.min(100, Math.round((p.score / maxScore) * 100));
    return `
      <div class="score-item">
        <div class="score-rank">${medals[i] || `${i+1}.`}</div>
        <div class="score-body">
          <div class="score-top">
            <div class="score-name">
              ${esc(p.nickname)}
              ${p.id === S.playerId ? '<span class="you-badge">You</span>' : ''}
            </div>
            <div class="score-pts">${p.score} / ${maxScore}</div>
          </div>
          <div class="score-bar-track">
            <div class="score-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Confetti ──────────────────────────────────────────────────
function fireConfetti(big = false) {
  if (typeof confetti === 'undefined') return;
  const opts = {
    particleCount: big ? 250 : 120,
    spread: big ? 100 : 70,
    origin: { y: 0.55 },
    colors: ['#7c3aed','#a78bfa','#06b6d4','#f59e0b','#10b981','#f1f5f9'],
    zIndex: 1500,
  };
  confetti(opts);
  if (big) {
    setTimeout(() => confetti({ ...opts, origin: { x: 0.2, y: 0.6 } }), 400);
    setTimeout(() => confetti({ ...opts, origin: { x: 0.8, y: 0.6 } }), 700);
  }
}

// ── Global leaderboard ────────────────────────────────────────
// Fetches all player rows across all rooms, aggregates wins by nickname,
// and renders the top 10 on the home screen.
async function loadLeaderboard() {
  const el = get('leaderboard-list');
  if (!el) return;
  el.innerHTML = '<div class="lb-loading">Loading...</div>';

  try {
    // Fetch every player row that has at least 1 point
    const { data, error } = await S.db
      .from('players')
      .select('nickname, score')
      .gt('score', 0);

    if (error) throw error;

    if (!data || data.length === 0) {
      el.innerHTML = '<div class="lb-empty">No scores yet — be the first to win! 🎵</div>';
      return;
    }

    // Aggregate total points per nickname (client-side)
    const agg = {};
    data.forEach(p => {
      const key = p.nickname.trim();
      agg[key] = (agg[key] || 0) + p.score;
    });

    // Sort and take top 10
    const top = Object.entries(agg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = top.map(([name, pts], i) => `
      <div class="lb-row">
        <span class="lb-rank">${medals[i] || `${i + 1}.`}</span>
        <span class="lb-name">${esc(name)}</span>
        <span class="lb-pts">${pts} pt${pts !== 1 ? 's' : ''}</span>
      </div>`).join('');
  } catch (_) {
    el.innerHTML = '<div class="lb-empty">Could not load leaderboard.</div>';
  }
}

// ── Helpers ───────────────────────────────────────────────────
function get(id) { return document.getElementById(id); }
function on(id, ev, fn) { get(id)?.addEventListener(ev, fn); }

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function pickTheme(current) {
  const pool = THEMES.filter(t => t !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

function validNick(n) {
  if (!n || n.length < 2) { toast('Nickname must be at least 2 characters.', 'error'); return false; }
  if (n.length > 20)      { toast('Nickname max 20 characters.', 'error'); return false; }
  return true;
}

function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function showLoading(msg = 'Loading…') { get('loading-text').textContent = msg; get('loading-overlay').classList.remove('hidden'); }
function hideLoading() { get('loading-overlay').classList.add('hidden'); }

let _toastTimer = null;
function toast(msg, type = '') {
  const el = get('toast');
  el.textContent = msg;
  el.className   = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 4000);
}
